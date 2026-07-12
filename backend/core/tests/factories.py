import factory
from django.contrib.auth.models import User
from core.models import Category, Transaction, Budget, Receipt, MonthlyReport
from decimal import Decimal
import datetime

class UserFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = User

    username = factory.Sequence(lambda n: f"user_{n}")
    email = factory.Sequence(lambda n: f"user_{n}@example.com")
    first_name = factory.Faker("first_name")
    last_name = factory.Faker("last_name")

    @classmethod
    def _create(cls, model_class, *args, **kwargs):
        manager = cls._get_manager(model_class)
        return manager.create_user(*args, **kwargs)

class CategoryFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Category

    user = factory.SubFactory(UserFactory)
    name = factory.Sequence(lambda n: f"Category_{n}")
    color = "#3b82f6"

class BudgetFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Budget

    user = factory.SubFactory(UserFactory)
    category = factory.SubFactory(CategoryFactory)
    limit_amount = Decimal("500.00")
    month = datetime.date(2026, 6, 1)

class TransactionFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Transaction

    user = factory.SubFactory(UserFactory)
    category = factory.SubFactory(CategoryFactory)
    amount = Decimal("50.00")
    type = "EXPENSE"
    date = datetime.date(2026, 6, 15)
    description = "Test Transaction"

class ReceiptFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = Receipt

    user = factory.SubFactory(UserFactory)
    image = "receipts/test.png"
    status = "pending"

class MonthlyReportFactory(factory.django.DjangoModelFactory):
    class Meta:
        model = MonthlyReport

    user = factory.SubFactory(UserFactory)
    month = datetime.date(2026, 6, 1)
    total_income = Decimal("1000.00")
    total_expense = Decimal("600.00")
    pdf_file = "reports/test.pdf"
