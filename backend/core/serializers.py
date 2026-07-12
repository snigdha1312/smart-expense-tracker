from rest_framework import serializers
from django.contrib.auth.models import User
from core.models import Category, Transaction, Budget, Receipt, MonthlyReport

class UserSerializer(serializers.ModelSerializer):
    """
    Serializer for the User profile.
    """
    name = serializers.CharField(source='first_name', read_only=True)

    class Meta:
        model = User
        fields = ('id', 'username', 'email', 'name', 'first_name', 'last_name')


class RegisterSerializer(serializers.ModelSerializer):
    """
    Serializer for registering new users.
    Maps name input to first_name, and enforces email-as-username.
    Seeds default categories upon successful creation.
    """
    name = serializers.CharField(write_only=True, required=False)
    email = serializers.EmailField(required=True)
    password = serializers.CharField(write_only=True, min_length=6, required=True)

    class Meta:
        model = User
        fields = ('email', 'password', 'name')

    def validate_email(self, value):
        email = value.lower()
        if User.objects.filter(email=email).exists() or User.objects.filter(username=email).exists():
            raise serializers.ValidationError("A user with this email already exists.")
        return email

    def create(self, validated_data):
        email = validated_data['email']
        password = validated_data['password']
        name = validated_data.get('name', '')

        user = User.objects.create_user(
            username=email,
            email=email,
            password=password,
            first_name=name
        )

        # Seed starting categories linked to this specific user (so they can modify/delete them)
        default_categories = [
            {"name": "Food", "color": "#ef4444", "icon": "Utensils"},
            {"name": "Transport", "color": "#3b82f6", "icon": "Car"},
            {"name": "Bills", "color": "#f59e0b", "icon": "FileText"},
            {"name": "Entertainment", "color": "#10b981", "icon": "Tv"},
            {"name": "Shopping", "color": "#ec4899", "icon": "ShoppingBag"},
            {"name": "Other", "color": "#6b7280", "icon": "HelpCircle"},
        ]
        
        for cat in default_categories:
            Category.objects.create(
                user=user,
                name=cat["name"],
                color=cat["color"],
                icon=cat["icon"],
                is_default=False
            )

        return user


class CategorySerializer(serializers.ModelSerializer):
    """
    Serializer for categories.
    """
    class Meta:
        model = Category
        fields = ('id', 'name', 'color', 'icon', 'is_default')
        read_only_fields = ('id', 'is_default')


class TransactionSerializer(serializers.ModelSerializer):
    """
    Serializer for transactions.
    Supports reading nested category details, and writing using category ID.
    """
    category_details = CategorySerializer(source='category', read_only=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=True
    )

    class Meta:
        model = Transaction
        fields = (
            'id', 'category', 'category_details', 'amount', 
            'type', 'date', 'description', 'is_recurring', 
            'recurrence_rule', 'created_at'
        )
        read_only_fields = ('id', 'created_at')

    def validate_category(self, value):
        # Validate that the category is owned by the request user OR is a system default category
        request = self.context.get('request')
        if request and value.user != request.user and not value.is_default:
            raise serializers.ValidationError("Invalid category selected.")
        return value


class BudgetSerializer(serializers.ModelSerializer):
    """
    Serializer for Budgets.
    """
    category_details = CategorySerializer(source='category', read_only=True)
    category = serializers.PrimaryKeyRelatedField(
        queryset=Category.objects.all(),
        required=True
    )

    class Meta:
        model = Budget
        fields = ('id', 'category', 'category_details', 'month', 'limit_amount')
        read_only_fields = ('id',)

    def validate_category(self, value):
        request = self.context.get('request')
        if request and value.user != request.user and not value.is_default:
            raise serializers.ValidationError("Invalid category selected.")
        return value

    def validate_month(self, value):
        import datetime
        if isinstance(value, datetime.date):
            return value.replace(day=1)
        return value


class ReceiptSerializer(serializers.ModelSerializer):
    """
    Serializer for Receipt scans.
    """
    class Meta:
        model = Receipt
        fields = (
            'id', 'image', 'uploaded_at', 'status', 
            'extracted_amount', 'extracted_date', 
            'extracted_merchant', 'linked_transaction'
        )
        read_only_fields = (
            'id', 'uploaded_at', 'status', 
            'extracted_amount', 'extracted_date', 
            'extracted_merchant', 'linked_transaction'
        )


class MonthlyReportSerializer(serializers.ModelSerializer):
    """
    Serializer for Monthly Reports.
    """
    class Meta:
        model = MonthlyReport
        fields = ('id', 'month', 'total_income', 'total_expense', 'pdf_file', 'generated_at')
        read_only_fields = ('id', 'pdf_file', 'generated_at')



