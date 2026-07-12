import pytest
from rest_framework import status
from rest_framework.test import APIClient
from core.tests.factories import UserFactory, CategoryFactory, BudgetFactory, TransactionFactory
from core.models import Transaction
from decimal import Decimal
import datetime
from django.core.files.uploadedfile import SimpleUploadedFile

@pytest.fixture
def api_client():
    return APIClient()

@pytest.fixture
def auth_client(api_client):
    user = UserFactory(username="authed_user")
    api_client.force_authenticate(user=user)
    api_client.user = user
    return api_client

@pytest.mark.django_db
def test_auth_flow(api_client):
    # Registration
    register_url = "/api/auth/register/"
    register_data = {
        "email": "new_user@example.com",
        "password": "Password123",
        "name": "New User"
    }
    response = api_client.post(register_url, register_data)
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["email"] == "new_user@example.com"

    # Login
    login_url = "/api/auth/login/"
    login_data = {
        "username": "new_user@example.com",
        "password": "Password123"
    }
    response = api_client.post(login_url, login_data)
    assert response.status_code == status.HTTP_200_OK
    assert "access" in response.data
    assert "refresh" in response.data

@pytest.mark.django_db
def test_is_owner_permission(api_client):
    user_a = UserFactory(username="usera")
    user_b = UserFactory(username="userb")
    
    cat_b = CategoryFactory(user=user_b, name="User B Category")
    tx_b = TransactionFactory(user=user_b, category=cat_b, amount=100.00, description="Secret")

    # Authenticate as User A
    api_client.force_authenticate(user=user_a)

    # Attempt to access User B's transaction - should fail with 404
    response = api_client.get(f"/api/transactions/{tx_b.id}/")
    assert response.status_code == status.HTTP_404_NOT_FOUND

    # Attempt to modify User B's category - should fail with 404
    response = api_client.patch(f"/api/categories/{cat_b.id}/", {"name": "Hacked"})
    assert response.status_code == status.HTTP_404_NOT_FOUND

@pytest.mark.django_db
def test_budget_summary_aggregation(auth_client):
    user = auth_client.user
    month_date = datetime.date(2026, 6, 1)
    
    cat_food = CategoryFactory(user=user, name="Food")
    cat_travel = CategoryFactory(user=user, name="Travel")
    
    BudgetFactory(user=user, category=cat_food, limit_amount=200.00, month=month_date)
    BudgetFactory(user=user, category=cat_travel, limit_amount=100.00, month=month_date)
    
    TransactionFactory(user=user, category=cat_food, amount=150.00, type="EXPENSE", date=datetime.date(2026, 6, 10))
    TransactionFactory(user=user, category=cat_food, amount=30.00, type="EXPENSE", date=datetime.date(2026, 6, 12))
    TransactionFactory(user=user, category=cat_travel, amount=120.00, type="EXPENSE", date=datetime.date(2026, 6, 15))
    TransactionFactory(user=user, category=cat_food, amount=50.00, type="EXPENSE", date=datetime.date(2026, 7, 1))

    response = auth_client.get("/api/budgets/summary/?month=2026-06")
    assert response.status_code == status.HTTP_200_OK
    
    data = response.data
    assert len(data) == 2
    
    food_summary = next(item for item in data if item["category_name"] == "Food")
    assert float(food_summary["limit_amount"]) == 200.00
    assert float(food_summary["spent_amount"]) == 180.00
    assert float(food_summary["percentage_used"]) == 90.0
    assert food_summary["is_over_budget"] is False
    
    travel_summary = next(item for item in data if item["category_name"] == "Travel")
    assert float(travel_summary["limit_amount"]) == 100.00
    assert float(travel_summary["spent_amount"]) == 120.00
    assert float(travel_summary["percentage_used"]) == 120.0
    assert travel_summary["is_over_budget"] is True

@pytest.mark.django_db
def test_csv_import_malformed(auth_client):
    user = auth_client.user
    # Ensure default category "Other" exists
    CategoryFactory(user=None, name="Other", is_default=True)
    cat_food = CategoryFactory(user=user, name="Food")

    # date,amount,type,category,description
    csv_content = (
        "date,amount,type,category,description\n"
        "2026-06-01,15.50,expense,Food,Burger Joint\n"
        "2026-06-02,,expense,Utilities,Missing amount\n"
        " 06/03/2026 , $120.00 , INCOME , Salary , Paycheck \n"
    )
    
    csv_file = SimpleUploadedFile("transactions.csv", csv_content.encode("utf-8"), content_type="text/csv")
    
    response = auth_client.post("/api/transactions/import-preview/", {"file": csv_file}, format="multipart")
    assert response.status_code == status.HTTP_200_OK
    
    data = response.data
    assert "valid" in data
    assert "errors" in data
    
    valid = data["valid"]
    errors = data["errors"]
    
    # 2 rows should be valid (Row 1 Burger Joint, Row 3 Paycheck)
    # 1 row should fail (Row 2 Utilities missing amount)
    assert len(valid) == 2
    assert len(errors) == 1
    
    assert float(valid[0]["amount"]) == 15.50
    assert float(valid[1]["amount"]) == 120.00
    assert valid[1]["type"] == "INCOME"
    assert errors[0]["row_index"] == 3

    # Import confirm request
    confirm_data = {
        "transactions": [
            {
                "date": valid[0]["date"],
                "amount": valid[0]["amount"],
                "type": valid[0]["type"],
                "category_id": valid[0]["category_id"],
                "description": valid[0]["description"]
            },
            {
                "date": valid[1]["date"],
                "amount": valid[1]["amount"],
                "type": valid[1]["type"],
                "category_id": valid[1]["category_id"],
                "description": valid[1]["description"]
            }
        ]
    }
    
    response = auth_client.post("/api/transactions/import-confirm/", confirm_data, format="json")
    assert response.status_code == status.HTTP_201_CREATED
    assert response.data["imported"] == 2
    
    assert Transaction.objects.filter(user=user).count() == 2
