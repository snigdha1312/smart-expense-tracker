from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status, generics, permissions, viewsets, parsers
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from django.db import connection, models, transaction as db_transaction
import redis
from django.conf import settings
from expense_tracker.celery import app as celery_app
from django.contrib.auth.models import User

from core.models import Category, Transaction, Budget, Receipt, MonthlyReport
from core.permissions import IsOwner
from core.tasks import debug_delayed_print, process_receipt, generate_monthly_report, generate_ai_insights
from core.serializers import (
    RegisterSerializer, 
    UserSerializer, 
    CategorySerializer, 
    TransactionSerializer,
    BudgetSerializer,
    ReceiptSerializer,
    MonthlyReportSerializer
)

import re
import csv
import datetime
from decimal import Decimal

# Defensive date formatting patterns
DATE_FORMATS = [
    '%Y-%m-%d', '%d-%m-%Y', '%m/%d/%Y', '%d/%m/%Y',
    '%Y/%m/%d', '%d %b %Y', '%b %d, %Y', '%B %d, %Y'
]

def parse_date_defensively(date_str):
    date_str = str(date_str).strip()
    for fmt in DATE_FORMATS:
        try:
            return datetime.datetime.strptime(date_str, fmt).date()
        except ValueError:
            continue
    try:
        from dateutil import parser
        return parser.parse(date_str).date()
    except Exception:
        raise ValueError(f"Invalid date format: '{date_str}'")

def parse_amount_defensively(amount_str):
    amount_str = str(amount_str).strip()
    clean_str = re.sub(r'[^\d\.\-]', '', amount_str)
    try:
        return Decimal(clean_str)
    except Exception:
        raise ValueError(f"Invalid decimal amount: '{amount_str}'")


class HealthCheckView(APIView):
    """
    Endpoint to check the status of:
    - Django Application
    - PostgreSQL Database
    - Redis Broker
    - Celery Workers
    """
    authentication_classes = []
    permission_classes = []

    def get(self, request, *args, **kwargs):
        health_status = {
            "status": "healthy",
            "services": {
                "django": {
                    "status": "healthy",
                    "message": "Django backend is running."
                },
                "database": {
                    "status": "unhealthy",
                    "message": "Not tested"
                },
                "redis": {
                    "status": "unhealthy",
                    "message": "Not tested"
                },
                "celery": {
                    "status": "unhealthy",
                    "message": "Not tested"
                }
            }
        }
        
        # 1. Check Database
        try:
            with connection.cursor() as cursor:
                cursor.execute("SELECT 1;")
                cursor.fetchone()
            health_status["services"]["database"] = {
                "status": "healthy",
                "message": "PostgreSQL database connection established successfully."
            }
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["services"]["database"] = {
                "status": "unhealthy",
                "message": f"Database error: {str(e)}"
            }

        # 2. Check Redis
        try:
            r = redis.from_url(settings.CELERY_BROKER_URL)
            r.ping()
            health_status["services"]["redis"] = {
                "status": "healthy",
                "message": "Redis connection established successfully."
            }
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["services"]["redis"] = {
                "status": "unhealthy",
                "message": f"Redis error: {str(e)}"
            }

        # 3. Check Celery
        try:
            insp = celery_app.control.inspect()
            stats = insp.stats()
            if stats:
                health_status["services"]["celery"] = {
                    "status": "healthy",
                    "message": f"Celery workers active: {list(stats.keys())}"
                }
            else:
                health_status["status"] = "unhealthy"
                health_status["services"]["celery"] = {
                    "status": "unhealthy",
                    "message": "No active Celery workers found. Make sure the worker service is running."
                }
        except Exception as e:
            health_status["status"] = "unhealthy"
            health_status["services"]["celery"] = {
                "status": "unhealthy",
                "message": f"Celery error: {str(e)}"
            }

        return Response(health_status, status=status.HTTP_200_OK)


class RegisterView(generics.CreateAPIView):
    """
    Endpoint to register a new user.
    """
    queryset = User.objects.all()
    permission_classes = (permissions.AllowAny,)
    serializer_class = RegisterSerializer


class UserMeView(generics.RetrieveAPIView):
    """
    Endpoint to retrieve the current user's profile.
    """
    permission_classes = (permissions.IsAuthenticated,)
    serializer_class = UserSerializer

    def get_object(self):
        return self.request.user


class CategoryViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Category model.
    Users can list system defaults + their custom categories.
    Modifications/deletions are locked strictly to their own custom categories.
    """
    serializer_class = CategorySerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        # Allow reading user's custom categories and system default categories
        return Category.objects.filter(
            models.Q(user=self.request.user) | models.Q(is_default=True)
        )

    def perform_create(self, serializer):
        # Force user association and ensure custom categories are not marked as system defaults
        serializer.save(user=self.request.user, is_default=False)


class TransactionPagination(PageNumberPagination):
    """
    Standard pagination returning 20 transactions per page.
    """
    page_size = 20
    page_size_query_param = 'page_size'
    max_page_size = 100


class TransactionViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Transaction model.
    Enforces user data isolation, support sorting, page-pagination, and parameter filters.
    """
    serializer_class = TransactionSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]
    pagination_class = TransactionPagination

    def get_queryset(self):
        # Queryset scoped strictly to current user's transactions
        queryset = Transaction.objects.filter(user=self.request.user)

        # Apply Category filters
        category = self.request.query_params.get('category')
        if category:
            queryset = queryset.filter(category_id=category)

        # Apply Type filters (INCOME/EXPENSE)
        tx_type = self.request.query_params.get('type')
        if tx_type:
            queryset = queryset.filter(type=tx_type.upper())

        # Apply Date range filters
        start_date = self.request.query_params.get('start_date')
        if start_date:
            queryset = queryset.filter(date__gte=start_date)

        end_date = self.request.query_params.get('end_date')
        if end_date:
            queryset = queryset.filter(date__lte=end_date)

        # Apply Ordering
        ordering = self.request.query_params.get('ordering')
        if ordering in ['date', '-date', 'amount', '-amount']:
            queryset = queryset.order_by(ordering)
        else:
            # Default ordering
            queryset = queryset.order_by('-date', '-created_at')

        return queryset

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'], url_path='export')
    def export(self, request):
        from django.http import StreamingHttpResponse

        class Echo:
            def write(self, value):
                return value

        def row_generator(queryset):
            echo = Echo()
            writer = csv.writer(echo)
            yield writer.writerow(['Date', 'Amount', 'Type', 'Category', 'Description', 'Is Recurring'])
            
            for tx in queryset.select_related('category'):
                yield writer.writerow([
                    tx.date.strftime('%Y-%m-%d'),
                    str(tx.amount),
                    tx.type,
                    tx.category.name,
                    tx.description,
                    'Yes' if tx.is_recurring else 'No'
                ])

        queryset = self.filter_queryset(self.get_queryset())
        response = StreamingHttpResponse(
            row_generator(queryset),
            content_type='text/csv'
        )
        response['Content-Disposition'] = 'attachment; filename="transactions.csv"'
        return response

    @action(detail=False, methods=['post'], url_path='import-preview')
    def import_preview(self, request):
        file_obj = request.FILES.get('file')
        if not file_obj:
            return Response({"detail": "No file uploaded."}, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            raw_content = file_obj.read()
            try:
                decoded_content = raw_content.decode('utf-8-sig')
            except UnicodeDecodeError:
                decoded_content = raw_content.decode('latin-1')
            
            lines = decoded_content.splitlines()
            reader = csv.reader(lines)
            rows = list(reader)
        except Exception as e:
            return Response({"detail": f"Failed to parse CSV file: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        if not rows:
            return Response({"detail": "Uploaded CSV file is empty."}, status=status.HTTP_400_BAD_REQUEST)

        first_row = rows[0]
        mapping = {}
        is_header = False
        for idx, cell in enumerate(first_row):
            val = str(cell).lower().strip()
            if 'date' in val or 'time' in val:
                mapping['date'] = idx
                is_header = True
            elif 'amount' in val or 'value' in val or 'total' in val or 'sum' in val:
                mapping['amount'] = idx
                is_header = True
            elif any(k in val for k in ['desc', 'merchant', 'payee', 'memo', 'detail']):
                mapping['description'] = idx
                is_header = True
            elif 'cat' in val:
                mapping['category'] = idx
                is_header = True
            elif 'type' in val:
                mapping['type'] = idx
                is_header = True

        if not is_header or 'date' not in mapping or 'amount' not in mapping:
            mapping = {
                'date': 0,
                'description': 1,
                'amount': 2,
                'category': 3,
                'type': 4
            }
            start_index = 0
        else:
            start_index = 1

        valid_rows = []
        errors = []

        categories = list(Category.objects.filter(models.Q(user=request.user) | models.Q(is_default=True)))
        existing_transactions = set(
            Transaction.objects.filter(user=request.user).values_list('date', 'amount', 'description')
        )
        existing_lookup = {
            (date, float(amount), desc.strip().lower()) for date, amount, desc in existing_transactions
        }
        seen_in_csv = set()

        for i in range(start_index, len(rows)):
            row = rows[i]
            if not row or all(not cell.strip() for cell in row):
                continue

            row_num = i + 1
            try:
                if len(row) <= mapping['date']:
                    raise ValueError("Row is missing the date column.")
                raw_date = row[mapping['date']]
                parsed_date = parse_date_defensively(raw_date)

                if len(row) <= mapping['amount']:
                    raise ValueError("Row is missing the amount column.")
                raw_amount = row[mapping['amount']]
                parsed_amount = parse_amount_defensively(raw_amount)

                raw_desc = ""
                if 'description' in mapping and len(row) > mapping['description']:
                    raw_desc = row[mapping['description']].strip()
                if not raw_desc:
                    raw_desc = "Imported Transaction"

                raw_cat = ""
                if 'category' in mapping and len(row) > mapping['category']:
                    raw_cat = row[mapping['category']].strip()

                matched_cat = None
                if raw_cat:
                    matched_cat = next((c for c in categories if c.name.lower() == raw_cat.lower()), None)
                
                if not matched_cat:
                    matched_cat = next((c for c in categories if c.name.lower() == 'other'), None)
                    if not matched_cat:
                        matched_cat = Category.objects.filter(is_default=True, name='Other').first()

                raw_type = ""
                if 'type' in mapping and len(row) > mapping['type']:
                    raw_type = row[mapping['type']].strip().upper()
                
                parsed_type = 'EXPENSE'
                if raw_type:
                    if 'INC' in raw_type or 'DEP' in raw_type or 'CREDIT' in raw_type:
                        parsed_type = 'INCOME'
                    elif 'EXP' in raw_type or 'DEBIT' in raw_type:
                        parsed_type = 'EXPENSE'
                else:
                    if parsed_amount < 0:
                        parsed_amount = abs(parsed_amount)
                        parsed_type = 'EXPENSE'
                    else:
                        parsed_type = 'EXPENSE'

                key = (parsed_date, float(parsed_amount), raw_desc.strip().lower())
                is_duplicate = (key in existing_lookup) or (key in seen_in_csv)
                seen_in_csv.add(key)

                valid_rows.append({
                    "row_index": row_num,
                    "date": parsed_date.strftime('%Y-%m-%d'),
                    "amount": str(parsed_amount),
                    "type": parsed_type,
                    "category_id": matched_cat.id,
                    "category_name": matched_cat.name,
                    "description": raw_desc,
                    "is_duplicate": is_duplicate
                })

            except Exception as err:
                errors.append({
                    "row_index": row_num,
                    "raw_data": ",".join(row),
                    "reason": str(err)
                })

        return Response({
            "valid": valid_rows,
            "errors": errors
        }, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], url_path='import-confirm')
    def import_confirm(self, request):
        from django.db import transaction

        tx_list = request.data.get('transactions', [])
        if not tx_list:
            return Response({"detail": "No transactions provided for confirmation."}, status=status.HTTP_400_BAD_REQUEST)

        created_count = 0
        try:
            with transaction.atomic():
                for item in tx_list:
                    category_id = item.get('category_id')
                    category = Category.objects.filter(
                        models.Q(user=request.user) | models.Q(is_default=True),
                        id=category_id
                    ).first()
                    if not category:
                        category = Category.objects.filter(
                            models.Q(user=request.user) | models.Q(is_default=True),
                            name='Other'
                        ).first()

                    Transaction.objects.create(
                        user=request.user,
                        date=item.get('date'),
                        amount=item.get('amount'),
                        type=item.get('type', 'EXPENSE'),
                        category=category,
                        description=item.get('description', 'Imported Transaction')
                    )
                    created_count += 1
        except Exception as e:
            return Response({"detail": f"Database transaction failed: {str(e)}"}, status=status.HTTP_400_BAD_REQUEST)

        return Response({"imported": created_count}, status=status.HTTP_201_CREATED)



class BudgetViewSet(viewsets.ModelViewSet):
    """
    ViewSet for Budget model.
    Enforces user data isolation and provides monthly summaries.
    """
    serializer_class = BudgetSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Budget.objects.filter(user=self.request.user)

    def perform_create(self, serializer):
        serializer.save(user=self.request.user)

    @action(detail=False, methods=['get'], url_path='summary')
    def summary(self, request):
        from django.db.models import Sum, Q, DecimalField
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        import calendar
        import datetime
        from rest_framework.decorators import action

        user = request.user
        month_str = request.query_params.get('month') # expected YYYY-MM
        
        if not month_str:
            month_str = datetime.date.today().strftime('%Y-%m')

        try:
            year, month_num = map(int, month_str.split('-'))
            _, last_day = calendar.monthrange(year, month_num)
            start_date = f"{year:04d}-{month_num:02d}-01"
            end_date = f"{year:04d}-{month_num:02d}-{last_day:02d}"
        except Exception:
            return Response(
                {"detail": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Single optimized query to fetch budgets annotated with spent transaction totals
        budgets = Budget.objects.filter(
            user=user,
            month=start_date
        ).select_related('category').annotate(
            spent_amount=Coalesce(
                Sum(
                    'category__transactions__amount',
                    filter=Q(
                        category__transactions__user=user,
                        category__transactions__type='EXPENSE',
                        category__transactions__date__range=(start_date, end_date)
                    )
                ),
                Decimal('0.0'),
                output_field=DecimalField()
            )
        )

        results = []
        for b in budgets:
            limit = b.limit_amount
            spent = b.spent_amount
            percentage = 0.0
            if limit > 0:
                percentage = float((spent / limit) * 100)
            
            results.append({
                "id": b.id,
                "category_id": b.category.id,
                "category_name": b.category.name,
                "category_color": b.category.color,
                "limit_amount": str(limit),
                "spent_amount": str(spent),
                "percentage_used": round(percentage, 2),
                "is_over_budget": spent > limit
            })

        return Response(results, status=status.HTTP_200_OK)


class AnalyticsViewSet(viewsets.ViewSet):
    """
    ViewSet to handle analytics data generation.
    """
    permission_classes = [permissions.IsAuthenticated]

    @action(detail=False, methods=['get'], url_path='category-breakdown')
    def category_breakdown(self, request):
        from django.db.models import Sum
        from decimal import Decimal
        import calendar
        import datetime

        user = request.user
        month_str = request.query_params.get('month')
        if not month_str:
            month_str = datetime.date.today().strftime('%Y-%m')

        try:
            year, month_num = map(int, month_str.split('-'))
            _, last_day = calendar.monthrange(year, month_num)
            start_date = f"{year:04d}-{month_num:02d}-01"
            end_date = f"{year:04d}-{month_num:02d}-{last_day:02d}"
        except Exception:
            return Response(
                {"detail": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Retrieve all expenses grouped by category
        breakdown = Transaction.objects.filter(
            user=user,
            type='EXPENSE',
            date__range=(start_date, end_date)
        ).values('category__name', 'category__color').annotate(
            total=Sum('amount')
        ).order_by('-total')

        total_expense = sum(item['total'] for item in breakdown) if breakdown else Decimal('0.0')

        results = []
        for item in breakdown:
            percentage = 0.0
            if total_expense > 0:
                percentage = float((item['total'] / total_expense) * 100)
            results.append({
                "category_name": item['category__name'],
                "category_color": item['category__color'],
                "total": str(item['total']),
                "percentage": round(percentage, 2)
            })

        return Response(results, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='trend')
    def trend(self, request):
        from django.db.models.functions import TruncMonth
        from django.db.models import Sum
        import datetime

        user = request.user
        months_param = request.query_params.get('months', '6')
        try:
            months = int(months_param)
            if months <= 0:
                raise ValueError()
        except ValueError:
            return Response(
                {"detail": "months parameter must be a positive integer."},
                status=status.HTTP_400_BAD_REQUEST
            )

        today = datetime.date.today()
        current_year = today.year
        current_month = today.month

        # Generate list of month strings in reverse chronological order
        months_list = []
        for i in range(months):
            m = current_month - i
            y = current_year
            while m <= 0:
                m += 12
                y -= 1
            months_list.append(f"{y:04d}-{m:02d}")
        
        months_list.reverse()
        start_date_str = f"{months_list[0]}-01"

        # Query all transactions from start_date_str onwards
        trend_data = Transaction.objects.filter(
            user=user,
            date__gte=start_date_str
        ).annotate(
            month_truncated=TruncMonth('date')
        ).values('month_truncated', 'type').annotate(
            total=Sum('amount')
        ).order_by('month_truncated')

        # Initialize map
        monthly_map = {m_str: {"month": m_str, "income": 0.0, "expense": 0.0} for m_str in months_list}

        for item in trend_data:
            m_str = item['month_truncated'].strftime('%Y-%m')
            tx_type = item['type'].lower()
            if m_str in monthly_map:
                monthly_map[m_str][tx_type] = float(item['total'])

        results = [monthly_map[m_str] for m_str in months_list]
        return Response(results, status=status.HTTP_200_OK)

    @action(detail=False, methods=['get'], url_path='budget-vs-actual')
    def budget_vs_actual(self, request):
        from django.db.models import Sum, Q, DecimalField
        from django.db.models.functions import Coalesce
        from decimal import Decimal
        import calendar
        import datetime

        user = request.user
        month_str = request.query_params.get('month')
        if not month_str:
            month_str = datetime.date.today().strftime('%Y-%m')

        try:
            year, month_num = map(int, month_str.split('-'))
            _, last_day = calendar.monthrange(year, month_num)
            start_date = f"{year:04d}-{month_num:02d}-01"
            end_date = f"{year:04d}-{month_num:02d}-{last_day:02d}"
        except Exception:
            return Response(
                {"detail": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Single optimized query to fetch budgets annotated with spent transaction totals
        budgets = Budget.objects.filter(
            user=user,
            month=start_date
        ).select_related('category').annotate(
            spent_amount=Coalesce(
                Sum(
                    'category__transaction__amount',
                    filter=Q(
                        category__transaction__user=user,
                        category__transaction__type='EXPENSE',
                        category__transaction__date__range=(start_date, end_date)
                    )
                ),
                Decimal('0.0'),
                output_field=DecimalField()
            )
        )

        results = []
        for b in budgets:
            limit = b.limit_amount
            spent = b.spent_amount
            percentage = 0.0
            if limit > 0:
                percentage = float((spent / limit) * 100)
            
            results.append({
                "category_name": b.category.name,
                "category_color": b.category.color,
                "limit_amount": float(limit),
                "spent_amount": float(spent),
                "percentage_used": round(percentage, 2),
                "is_over_budget": spent > limit
            })

        return Response(results, status=status.HTTP_200_OK)


class TestCeleryView(APIView):
    permission_classes = [permissions.AllowAny]

    def post(self, request):
        seconds = int(request.data.get('seconds', 5))
        message = request.data.get('message', 'Hello Celery!')
        task = debug_delayed_print.delay(seconds, message)
        return Response({
            "status": "Task queued successfully",
            "task_id": task.id,
            "message": message,
            "seconds": seconds
        })


class ReceiptViewSet(viewsets.ModelViewSet):
    serializer_class = ReceiptSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return Receipt.objects.filter(user=self.request.user)

    @action(detail=False, methods=['post'], url_path='upload', parser_classes=(parsers.MultiPartParser, parsers.FormParser))
    def upload(self, request):
        image_file = request.FILES.get('image')
        if not image_file:
            return Response({"error": "No image file provided."}, status=status.HTTP_400_BAD_REQUEST)
        
        receipt = Receipt.objects.create(
            user=request.user,
            image=image_file,
            status='PENDING'
        )
        
        # Trigger Celery task asynchronously
        process_receipt.delay(receipt.id)
        
        return Response({"id": receipt.id, "status": "PENDING"}, status=status.HTTP_201_CREATED)

    @action(detail=True, methods=['post'], url_path='confirm')
    def confirm(self, request, pk=None):
        receipt = self.get_object()
        if receipt.linked_transaction:
            return Response({"error": "This receipt has already been linked to a transaction."}, status=status.HTTP_400_BAD_REQUEST)

        # Retrieve parsed input fields
        amount_val = request.data.get('amount')
        date_val = request.data.get('date')
        merchant_val = request.data.get('merchant', '').strip()
        category_id = request.data.get('category_id')
        transaction_type = request.data.get('type', 'EXPENSE').upper()
        description = request.data.get('description', '').strip()

        if not amount_val or not date_val:
            return Response({"error": "Amount and date are required to confirm transaction."}, status=status.HTTP_400_BAD_REQUEST)

        # Parse and clean values
        try:
            amount = Decimal(str(amount_val))
        except Exception:
            return Response({"error": "Invalid amount format."}, status=status.HTTP_400_BAD_REQUEST)

        try:
            parsed_date = parse_date_defensively(date_val)
        except Exception:
            return Response({"error": "Invalid date format."}, status=status.HTTP_400_BAD_REQUEST)

        # Retrieve category
        category = None
        if category_id:
            category = Category.objects.filter(
                models.Q(user=request.user) | models.Q(is_default=True),
                id=category_id
            ).first()
        
        if not category:
            # Fallback to "Other"
            category = Category.objects.filter(
                models.Q(user=request.user) | models.Q(is_default=True),
                name__iexact='other'
            ).first()

        # Build transaction inside atomic transaction block
        with db_transaction.atomic():
            transaction = Transaction.objects.create(
                user=request.user,
                category=category,
                amount=amount,
                type=transaction_type,
                date=parsed_date,
                description=description or f"OCR Receipt: {merchant_val or 'Unknown'}"
            )
            receipt.linked_transaction = transaction
            receipt.save()

        # Return serialized transaction details
        return Response(TransactionSerializer(transaction, context={'request': request}).data, status=status.HTTP_201_CREATED)


from django.http import FileResponse

class MonthlyReportViewSet(viewsets.ReadOnlyModelViewSet):
    """
    ViewSet for listing and downloading user monthly reports.
    """
    serializer_class = MonthlyReportSerializer
    permission_classes = [permissions.IsAuthenticated, IsOwner]

    def get_queryset(self):
        return MonthlyReport.objects.filter(user=self.request.user).order_by('-month')

    @action(detail=False, methods=['get', 'post'])
    def generate(self, request):
        """
        Trigger report generation for a given month.
        Accepts ?month=YYYY-MM. Defaults to current month if not provided.
        """
        month_str = request.query_params.get('month') or request.data.get('month')
        if not month_str:
            month_str = datetime.datetime.now().strftime('%Y-%m')

        # Simple format validation
        if not re.match(r'^\d{4}-\d{2}$', month_str):
            return Response(
                {"error": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Trigger Celery task asynchronously
        task = generate_monthly_report.delay(request.user.id, month_str)

        return Response({
            "status": "queued",
            "message": f"Monthly report generation for {month_str} has been queued.",
            "task_id": task.id
        }, status=status.HTTP_202_ACCEPTED)

    @action(detail=True, methods=['get'])
    def download(self, request, pk=None):
        """
        Download the compiled PDF file for the report.
        """
        report = self.get_object()
        if not report.pdf_file:
            return Response(
                {"error": "PDF report file has not been generated yet."},
                status=status.HTTP_404_NOT_FOUND
            )

        try:
            response = FileResponse(report.pdf_file.open(), content_type='application/pdf')
            import os
            filename = os.path.basename(report.pdf_file.name)
            response['Content-Disposition'] = f'attachment; filename="{filename}"'
            return response
        except Exception as e:
            return Response(
                {"error": f"Failed to retrieve PDF file: {str(e)}"},
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )


class AIInsightsView(APIView):
    """
    View for retrieving cached monthly insights and requesting manual regeneration.
    """
    permission_classes = [permissions.IsAuthenticated]

    def get(self, request):
        """
        GET /api/insights/?month=YYYY-MM
        Returns the cached AI insights, or triggers generation if missing.
        """
        month_str = request.query_params.get('month')
        if not month_str:
            month_str = datetime.datetime.now().strftime('%Y-%m')

        if not re.match(r'^\d{4}-\d{2}$', month_str):
            return Response(
                {"error": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.datetime.strptime(month_str, '%Y-%m').date()
        except Exception:
            return Response({"error": "Invalid date parsing."}, status=400)

        report = MonthlyReport.objects.filter(user=request.user, month=start_date).first()

        # If report doesn't exist or insights are missing, trigger generation
        if not report or not report.ai_insights:
            generate_ai_insights.delay(request.user.id, month_str)
            return Response({
                "status": "generating",
                "message": "AI insights are being compiled in the background.",
                "insights": []
            }, status=status.HTTP_200_OK)

        # Enforce rate limit check to return to frontend for button state
        cooldown_seconds = 0
        if report.insights_updated_at:
            from django.utils import timezone
            elapsed = timezone.now() - report.insights_updated_at
            if elapsed < datetime.timedelta(hours=1):
                cooldown_seconds = int(3600 - elapsed.total_seconds())

        return Response({
            "status": "ready",
            "insights": report.ai_insights,
            "cooldown_seconds": max(0, cooldown_seconds),
            "last_generated": report.insights_updated_at
        }, status=status.HTTP_200_OK)

    def post(self, request):
        """
        POST /api/insights/
        Triggers manual regeneration of monthly insights.
        Enforces a rate limit of once per hour per user.
        """
        month_str = request.data.get('month') or request.query_params.get('month')
        if not month_str:
            month_str = datetime.datetime.now().strftime('%Y-%m')

        if not re.match(r'^\d{4}-\d{2}$', month_str):
            return Response(
                {"error": "Invalid month format. Expected YYYY-MM."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            start_date = datetime.datetime.strptime(month_str, '%Y-%m').date()
        except Exception:
            return Response({"error": "Invalid date parsing."}, status=400)

        # Check existing report row for rate-limiting
        report = MonthlyReport.objects.filter(user=request.user, month=start_date).first()
        if report and report.insights_updated_at:
            from django.utils import timezone
            elapsed = timezone.now() - report.insights_updated_at
            if elapsed < datetime.timedelta(hours=1):
                remaining = int(3600 - elapsed.total_seconds())
                return Response({
                    "error": f"You can only regenerate insights once per hour. Please wait {remaining // 60} minutes and {remaining % 60} seconds.",
                    "cooldown_seconds": remaining
                }, status=status.HTTP_429_TOO_MANY_REQUESTS)

        # Queue Celery task
        task = generate_ai_insights.delay(request.user.id, month_str)
        return Response({
            "status": "generating",
            "message": "Regeneration of AI insights has been queued.",
            "task_id": task.id
        }, status=status.HTTP_202_ACCEPTED)




