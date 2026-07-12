import re
import time
from datetime import datetime
from decimal import Decimal
from PIL import Image
import pytesseract
from celery import shared_task
from django.db import transaction as db_transaction
from core.models import Receipt

@shared_task
def debug_delayed_print(seconds, message):
    time.sleep(seconds)
    print(f"[Celery Worker Test Task] Delayed print message: {message}")
    return f"Printed: {message}"

def extract_merchant(lines):
    # Clean and skip common receipt headers/metadata
    skip_keywords = {
        'receipt', 'invoice', 'tax', 'welcome', 'sale', 
        'transaction', 'simplified', 'copy', 'payment', 
        'cashier', 'terminal', 'merchant', 'store', 'customer',
        'tel', 'phone', 'address'
    }
    for line in lines[:8]:
        cleaned = line.strip()
        if not cleaned:
            continue
        # Skip lines that are just dashes, symbols, or phone numbers/dates
        if re.match(r'^[=\-\*\._\s\+/\\#]+$', cleaned):
            continue
        if re.search(r'\d{3}-\d{3}-\d{4}', cleaned) or re.search(r'\b\d{10}\b', cleaned):
            continue
        # Check if line contains only skip keywords
        words = [w.lower() for w in re.findall(r'[A-Za-z]+', cleaned)]
        if words and all(w in skip_keywords for w in words):
            continue
        # If line has letters, it's likely the merchant name
        if re.search(r'[A-Za-z]', cleaned):
            return cleaned[:100]
    return "Unknown Merchant"

def extract_date(text):
    # Regex patterns for dates
    date_patterns = [
        r'\b(20\d{2})[-/.](0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])\b',  # YYYY-MM-DD
        r'\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](20\d{2})\b',  # DD-MM-YYYY
        r'\b(0[1-9]|1[0-2])[-/.](0[1-9]|[12]\d|3[01])[-/.](20\d{2})\b',  # MM-DD-YYYY
        r'\b(0[1-9]|[12]\d|3[01])[-/.](0[1-9]|1[0-2])[-/.](\d{2})\b',     # DD-MM-YY
    ]
    for pattern in date_patterns:
        match = re.search(pattern, text)
        if match:
            g1, g2, g3 = match.groups()
            if len(g1) == 4:
                try:
                    return datetime(int(g1), int(g2), int(g3)).date()
                except ValueError:
                    pass
            elif len(g3) == 4:
                try:
                    return datetime(int(g3), int(g2), int(g1)).date()
                except ValueError:
                    try:
                        return datetime(int(g3), int(g1), int(g2)).date()
                    except ValueError:
                        pass
            elif len(g3) == 2:
                try:
                    return datetime(2000 + int(g3), int(g2), int(g1)).date()
                except ValueError:
                    pass
                    
    # Try textual month names e.g. 15 Jun 2026
    text_date_pattern = r'\b(\d{1,2})\s+(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+(20\d{2}|\d{2})\b'
    match = re.search(text_date_pattern, text, re.IGNORECASE)
    if match:
        day, month_str, year_str = match.groups()
        months = {'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
                  'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12}
        month = months.get(month_str.lower()[:3], 1)
        year = int(year_str)
        if year < 100:
            year += 2000
        try:
            return datetime(year, month, int(day)).date()
        except ValueError:
            pass
            
    return None

def extract_amount(text, lines):
    # Look for lines with total keywords
    total_keywords = re.compile(
        r'\b(total|amount due|grand total|balance|net total|to pay|total due|gtotal|charge|payment|total amount)\b', 
        re.IGNORECASE
    )
    price_pattern = re.compile(r'(\d+[\.,]\d{2})')
    
    candidates = []
    for line in lines:
        if total_keywords.search(line):
            matches = price_pattern.findall(line)
            for m in matches:
                try:
                    val = float(m.replace(',', '.'))
                    candidates.append(val)
                except ValueError:
                    pass
                    
    if candidates:
        return Decimal(f"{max(candidates):.2f}")
        
    # Search all price matches in the text and get the maximum
    all_prices = price_pattern.findall(text)
    vals = []
    for p in all_prices:
        try:
            vals.append(float(p.replace(',', '.')))
        except ValueError:
            pass
    # Filter out values that are likely card numbers/dates/etc.
    filtered_vals = [v for v in vals if v < 10000.0]
    if filtered_vals:
        return Decimal(f"{max(filtered_vals):.2f}")
        
    return None

@shared_task
def process_receipt(receipt_id):
    try:
        receipt = Receipt.objects.get(id=receipt_id)
    except Receipt.DoesNotExist:
        return f"Receipt with ID {receipt_id} does not exist."

    try:
        # Load image and perform OCR using Tesseract
        image_path = receipt.image.path
        img = Image.open(image_path)
        raw_text = pytesseract.image_to_string(img)

        # Parse text into lines
        lines = [line.strip() for line in raw_text.split('\n') if line.strip()]

        # Run extraction heuristics
        merchant = extract_merchant(lines)
        date_obj = extract_date(raw_text)
        amount = extract_amount(raw_text, lines)

        # Fallback date to today if not parsed
        if not date_obj:
            date_obj = datetime.today().date()

        # Update database inside atomic transaction
        with db_transaction.atomic():
            receipt.extracted_merchant = merchant
            receipt.extracted_date = date_obj
            receipt.extracted_amount = amount
            receipt.status = 'PROCESSED'
            receipt.save()

        return f"Receipt {receipt_id} processed successfully: Merchant={merchant}, Amount={amount}, Date={date_obj}"

    except Exception as e:
        receipt.status = 'FAILED'
        receipt.save()
        return f"Receipt {receipt_id} failed with error: {str(e)}"

@shared_task
def generate_monthly_report(user_id, month_str):
    import calendar
    from weasyprint import HTML
    from django.core.files.base import ContentFile
    from django.template.loader import render_to_string
    from django.contrib.auth.models import User
    from django.db.models import Sum
    from core.models import Transaction, Category, Budget, MonthlyReport

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return f"User with ID {user_id} does not exist."

    # Parse target month e.g. "2026-06"
    try:
        parsed_date = datetime.strptime(month_str, '%Y-%m')
        year = parsed_date.year
        month = parsed_date.month
    except Exception as e:
        return f"Invalid month format '{month_str}': {str(e)}"

    start_date = datetime(year, month, 1).date()
    last_day = calendar.monthrange(year, month)[1]
    end_date = datetime(year, month, last_day).date()

    # Aggregate total income/expense
    transactions = Transaction.objects.filter(user=user, date__range=(start_date, end_date))
    total_income = transactions.filter(type='INCOME').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    total_expense = transactions.filter(type='EXPENSE').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    net_savings = total_income - total_expense
    
    savings_rate = 0.00
    if total_income > 0:
        savings_rate = float((net_savings / total_income) * 100)
        savings_rate = max(0.0, round(savings_rate, 2))

    # Category breakdown (expenses)
    category_expenses = (
        transactions.filter(type='EXPENSE')
        .values('category__id', 'category__name', 'category__color')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )
    
    categories_data = []
    for item in category_expenses:
        item_total = item['total'] or Decimal('0.00')
        percentage = 0.0
        if total_expense > 0:
            percentage = float((item_total / total_expense) * 100)
        categories_data.append({
            'name': item['category__name'],
            'color': item['category__color'] or '#6b7280',
            'total': f"{item_total:.2f}",
            'percentage': round(percentage, 1)
        })

    # Budget versus actual
    budgets = Budget.objects.filter(user=user, month=start_date)
    category_spent = (
        transactions.filter(type='EXPENSE')
        .values('category_id')
        .annotate(total=Sum('amount'))
    )
    spent_map = {x['category_id']: x['total'] or Decimal('0.00') for x in category_spent}

    budgets_data = []
    for b in budgets:
        spent = spent_map.get(b.category_id, Decimal('0.00'))
        limit = b.limit_amount
        percentage_used = 0.0
        if limit > 0:
            percentage_used = float((spent / limit) * 100)

        budgets_data.append({
            'category_name': b.category.name,
            'limit_amount': f"{limit:.2f}",
            'spent_amount': f"{spent:.2f}",
            'percentage_used': round(percentage_used, 1),
            'percentage_clamped': min(round(percentage_used, 1), 100.0),
            'is_over': spent > limit
        })

    # Render template
    month_name = parsed_date.strftime('%B %Y')
    context = {
        'user_name': user.first_name or user.username,
        'user_email': user.email,
        'month_name': month_name,
        'total_income': f"{total_income:.2f}",
        'total_expense': f"{total_expense:.2f}",
        'net_savings': f"{net_savings:.2f}",
        'net_savings_num': float(net_savings),
        'savings_rate': round(savings_rate, 2),
        'categories': categories_data,
        'budgets': budgets_data,
        'generated_at': datetime.now().strftime('%Y-%m-%d %H:%M:%S'),
    }

    html_string = render_to_string('report_template.html', context)

    # Render PDF using WeasyPrint
    pdf_bytes = HTML(string=html_string).write_pdf()

    # Save to model
    with db_transaction.atomic():
        report, created = MonthlyReport.objects.get_or_create(
            user=user,
            month=start_date,
            defaults={
                'total_income': total_income,
                'total_expense': total_expense,
            }
        )

        if not created:
            if report.pdf_file:
                report.pdf_file.delete(save=False)
            report.total_income = total_income
            report.total_expense = total_expense

        report.pdf_file.save(f"report_{user.id}_{month_str}.pdf", ContentFile(pdf_bytes))
        report.save()

    return f"Report generated successfully for user {user.username} (month={month_str})."

@shared_task
def generate_monthly_reports_for_all_users():
    from django.contrib.auth.models import User
    from datetime import datetime, timedelta
    
    # Calculate previous month
    today = datetime.today().date()
    first_of_this_month = today.replace(day=1)
    previous_month_date = first_of_this_month - timedelta(days=5)
    prev_month_str = previous_month_date.strftime('%Y-%m')
    
    active_users = User.objects.filter(is_active=True)
    count = 0
    for user in active_users:
        generate_monthly_report.delay(user.id, prev_month_str)
        count += 1
        
    return f"Triggered monthly report generation for {count} active users for month={prev_month_str}."


@shared_task
def generate_ai_insights(user_id, month_str):
    import calendar
    import os
    import json
    import requests
    from decimal import Decimal
    from django.contrib.auth.models import User
    from django.db.models import Sum
    from django.utils import timezone
    from core.models import Transaction, Budget, MonthlyReport

    try:
        user = User.objects.get(id=user_id)
    except User.DoesNotExist:
        return f"User with ID {user_id} does not exist."

    # Parse target month
    try:
        parsed_date = datetime.strptime(month_str, '%Y-%m')
        year = parsed_date.year
        month = parsed_date.month
    except Exception as e:
        return f"Invalid month format '{month_str}': {str(e)}"

    start_date = datetime(year, month, 1).date()
    last_day = calendar.monthrange(year, month)[1]
    end_date = datetime(year, month, last_day).date()

    # Aggregate stats
    transactions = Transaction.objects.filter(user=user, date__range=(start_date, end_date))
    total_income = transactions.filter(type='INCOME').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    total_expense = transactions.filter(type='EXPENSE').aggregate(total=Sum('amount'))['total'] or Decimal('0.00')
    net_savings = total_income - total_expense
    savings_rate = float((net_savings / total_income) * 100) if total_income > 0 else 0.0

    category_expenses = (
        transactions.filter(type='EXPENSE')
        .values('category__name')
        .annotate(total=Sum('amount'))
        .order_by('-total')
    )
    categories_data = []
    for item in category_expenses:
        item_total = item['total'] or Decimal('0.00')
        percentage = float((item_total / total_expense) * 100) if total_expense > 0 else 0.0
        categories_data.append({
            'name': item['category__name'],
            'total': float(item_total),
            'percentage': round(percentage, 1)
        })

    budgets = Budget.objects.filter(user=user, month=start_date)
    category_spent = (
        transactions.filter(type='EXPENSE')
        .values('category_id')
        .annotate(total=Sum('amount'))
    )
    spent_map = {x['category_id']: x['total'] or Decimal('0.00') for x in category_spent}
    budgets_data = []
    for b in budgets:
        spent = spent_map.get(b.category_id, Decimal('0.00'))
        limit = b.limit_amount
        percentage_used = float((spent / limit) * 100) if limit > 0 else 0.0
        budgets_data.append({
            'category_name': b.category.name,
            'limit_amount': float(limit),
            'spent_amount': float(spent),
            'percentage_used': round(percentage_used, 1),
            'is_over': spent > limit
        })

    insights = []

    # Check for GEMINI_API_KEY
    api_key = os.environ.get('GEMINI_API_KEY')
    if api_key:
        try:
            stats_summary = {
                "month": month_str,
                "total_income": float(total_income),
                "total_expense": float(total_expense),
                "net_savings": float(net_savings),
                "savings_rate_percent": round(savings_rate, 1),
                "category_expenses": categories_data,
                "budgets": budgets_data
            }

            prompt = (
                "You are an expert personal finance AI assistant. Analyze this user's monthly spending stats and provide exactly 2 to 3 "
                "specific, highly actionable spending insights.\n"
                "IMPORTANT: Do NOT give generic financial advice like 'save more' or 'try making a budget'. "
                "You must reference specific category names and dollar amounts from the statistics provided. For example, if a category is "
                "over budget, call it out by name and list the exact overrun amount. Compare their savings rate against a 20% benchmark.\n"
                "Format your response as a JSON array of objects, where each object has:\n"
                "- 'title': A short, punchy header (3-5 words).\n"
                "- 'text': A concise, specific explanation (1-2 sentences) referencing actual categories and dollar amounts.\n"
                "- 'type': One of 'warning' (for budget overruns or low savings), 'success' (for good savings rate/under-budget), or 'info' (general patterns).\n"
                "Input Statistics:\n"
                f"{json.dumps(stats_summary, indent=2)}\n"
            )

            url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={api_key}"
            headers = {'Content-Type': 'application/json'}
            payload = {
                "contents": [{"parts": [{"text": prompt}]}],
                "generationConfig": {
                    "responseMimeType": "application/json"
                }
            }
            response = requests.post(url, headers=headers, json=payload, timeout=12)
            if response.status_code == 200:
                result_json = response.json()
                text_content = result_json['candidates'][0]['content']['parts'][0]['text']
                parsed_insights = json.loads(text_content)
                if isinstance(parsed_insights, list):
                    insights = []
                    for item in parsed_insights[:3]:
                        insights.append({
                            "title": str(item.get("title", "Spending Insight")),
                            "text": str(item.get("text", "")),
                            "type": str(item.get("type", "info"))
                        })
        except Exception as e:
            pass

    # Local data-driven fallback insights if missing/failed API key
    if not insights:
        if savings_rate >= 20.0:
            insights.append({
                "title": "Healthy Savings Rate",
                "text": f"Your savings rate is {savings_rate:.1f}%, exceeding the 20% benchmark. You saved ${net_savings:.2f} this month.",
                "type": "success"
            })
        elif savings_rate > 0.0:
            target_amount = float(total_income) * 0.20
            insights.append({
                "title": "Increase Your Savings",
                "text": f"Your savings rate is {savings_rate:.1f}%. Increasing this to 20% (${target_amount:.2f}) will build your wealth faster.",
                "type": "info"
            })
        else:
            insights.append({
                "title": "Deficit Spending Alert",
                "text": f"You spent ${abs(net_savings):.2f} more than your income this month. Review non-essential spending to balance your budget.",
                "type": "warning"
            })

        if categories_data:
            top_cat = categories_data[0]
            insights.append({
                "title": f"Top Expense: {top_cat['name']}",
                "text": f"Spending in {top_cat['name']} totaled ${top_cat['total']:.2f} ({top_cat['percentage']}% of total expenses). Try to trim costs here.",
                "type": "info"
            })

        over_budgets = [b for b in budgets_data if b['is_over']]
        if over_budgets:
            top_over = max(over_budgets, key=lambda x: x['spent_amount'] - x['limit_amount'])
            diff = top_over['spent_amount'] - top_over['limit_amount']
            insights.append({
                "title": f"Budget Exceeded in {top_over['category_name']}",
                "text": f"You went over budget in {top_over['category_name']} by ${diff:.2f}. Consider curbing spending in this category next month.",
                "type": "warning"
            })
        elif budgets_data:
            insights.append({
                "title": "Budgets Fully On Track",
                "text": "Excellent discipline! All your active category budgets are under their limits this month.",
                "type": "success"
            })

    # Get or create report row
    report, created = MonthlyReport.objects.get_or_create(
        user=user,
        month=start_date,
        defaults={
            'total_income': total_income,
            'total_expense': total_expense,
            'pdf_file': ''
        }
    )
    
    report.ai_insights = insights
    report.insights_updated_at = timezone.now()
    report.save()

    return f"Successfully generated AI insights for user {user.username} for {month_str}."



