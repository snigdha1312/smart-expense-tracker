import pytest
from django.db import IntegrityError
from decimal import Decimal
from core.tests.factories import UserFactory, CategoryFactory, BudgetFactory, TransactionFactory, ReceiptFactory, MonthlyReportFactory
import datetime

@pytest.mark.django_db
def test_budget_unique_together_constraint():
    user = UserFactory()
    category = CategoryFactory(user=user)
    
    # Create first budget
    BudgetFactory(user=user, category=category, month=datetime.date(2026, 6, 1))
    
    # Attempting to create duplicate budget for same user, category, and month must fail
    with pytest.raises(IntegrityError):
        duplicate_budget = BudgetFactory.build(user=user, category=category, month=datetime.date(2026, 6, 1))
        duplicate_budget.save()

@pytest.mark.django_db
def test_model_str_representations():
    user = UserFactory(username="testuser")
    category = CategoryFactory(user=user, name="Groceries")
    budget = BudgetFactory(user=user, category=category, month=datetime.date(2026, 6, 1), limit_amount=Decimal("500.00"))
    transaction = TransactionFactory(user=user, category=category, description="Milk", amount=Decimal("50.00"), date=datetime.date(2026, 6, 15))
    receipt = ReceiptFactory(user=user)
    report = MonthlyReportFactory(user=user, month=datetime.date(2026, 6, 1))

    assert str(category) == "Groceries (testuser)"
    assert str(budget) == "Budget 500.00 for Groceries in 2026-06 by testuser"
    assert str(transaction) == "EXPENSE - 50.00 on 2026-06-15 by testuser"
    assert "uploaded by testuser" in str(receipt)
    assert str(report) == "Report 2026-06 for testuser"
