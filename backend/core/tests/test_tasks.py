import pytest
from unittest.mock import patch, MagicMock
from core.tests.factories import UserFactory, ReceiptFactory
from core.tasks import process_receipt
import datetime

@pytest.mark.django_db
@patch('core.tasks.pytesseract.image_to_string')
@patch('core.tasks.Image.open')
def test_process_receipt_ocr_parsing(mock_image_open, mock_image_to_string):
    user = UserFactory()
    receipt = ReceiptFactory(user=user)
    
    # Mock returns
    mock_img = MagicMock()
    mock_image_open.return_value = mock_img
    
    mock_ocr_text = (
        "WALMART STORE #1234\n"
        "123 Main Street, Austin, TX\n"
        "Date: 06/15/2026\n"
        "ITEMS:\n"
        "Milk: $3.50\n"
        "Bread: $2.50\n"
        "TAX: $0.50\n"
        "TOTAL AMOUNT DUE: $6.50\n"
        "Thank you for shopping!\n"
    )
    mock_image_to_string.return_value = mock_ocr_text

    # Execute celery task
    result = process_receipt(receipt.id)
    
    # Refresh receipt from DB
    receipt.refresh_from_db()
    
    assert receipt.status == 'PROCESSED'
    assert receipt.extracted_merchant == "WALMART STORE #1234"
    assert float(receipt.extracted_amount) == 6.50
    assert receipt.extracted_date == datetime.date(2026, 6, 15)
    assert "processed successfully" in result
