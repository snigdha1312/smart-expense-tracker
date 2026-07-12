from django.db import models
from django.contrib.auth.models import User

class Category(models.Model):
    """
    Categories for grouping expenses and income.
    System default categories are shared across all users (user=None, is_default=True).
    """
    name = models.CharField(max_length=100)
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='categories',
        db_index=True
    )
    color = models.CharField(max_length=7, default='#94a3b8')  # Hex code representation
    icon = models.CharField(max_length=50, null=True, blank=True)
    is_default = models.BooleanField(default=False)

    class Meta:
        verbose_name_plural = 'categories'
        ordering = ['name']

    def __str__(self):
        if self.is_default:
            return f"{self.name} (Default)"
        return f"{self.name} ({self.user.username if self.user else 'System'})"


class Transaction(models.Model):
    """
    Monetary transactions representing either income or expense.
    """
    TYPE_CHOICES = (
        ('INCOME', 'Income'),
        ('EXPENSE', 'Expense'),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='transactions',
        db_index=True
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='transactions',
        db_index=True
    )
    amount = models.DecimalField(max_digits=12, decimal_places=2)
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, db_index=True)
    date = models.DateField(db_index=True)
    description = models.TextField(blank=True)
    is_recurring = models.BooleanField(default=False)
    recurrence_rule = models.CharField(max_length=255, null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-date', '-created_at']

    def __str__(self):
        return f"{self.type} - {self.amount} on {self.date} by {self.user.username}"


class Budget(models.Model):
    """
    Monthly budgets set per category by users.
    Month field stores the first day of the budgeted month.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='budgets',
        db_index=True
    )
    category = models.ForeignKey(
        Category,
        on_delete=models.CASCADE,
        related_name='budgets',
        db_index=True
    )
    month = models.DateField(db_index=True)  # Stored as first of the month (e.g. YYYY-MM-01)
    limit_amount = models.DecimalField(max_digits=12, decimal_places=2)

    class Meta:
        unique_together = ('user', 'category', 'month')
        ordering = ['-month', 'category__name']

    def __str__(self):
        return f"Budget {self.limit_amount} for {self.category.name} in {self.month.strftime('%Y-%m')} by {self.user.username}"


class Receipt(models.Model):
    """
    Receipt scans uploaded by users. 
    Can be processed asynchronously using Celery & Tesseract OCR.
    """
    STATUS_CHOICES = (
        ('PENDING', 'Pending'),
        ('PROCESSED', 'Processed'),
        ('FAILED', 'Failed'),
    )

    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='receipts',
        db_index=True
    )
    image = models.ImageField(upload_to='receipts/')
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='PENDING', db_index=True)
    extracted_amount = models.DecimalField(max_digits=12, decimal_places=2, null=True, blank=True)
    extracted_date = models.DateField(null=True, blank=True)
    extracted_merchant = models.CharField(max_length=255, null=True, blank=True)
    linked_transaction = models.ForeignKey(
        Transaction,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='receipts'
    )

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"Receipt {self.id} ({self.status}) uploaded by {self.user.username}"


class MonthlyReport(models.Model):
    """
    Aggregated monthly reports downloadable as PDFs.
    """
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name='reports',
        db_index=True
    )
    month = models.DateField(db_index=True)  # Stored as first of the month (e.g. YYYY-MM-01)
    total_income = models.DecimalField(max_digits=12, decimal_places=2)
    total_expense = models.DecimalField(max_digits=12, decimal_places=2)
    pdf_file = models.FileField(upload_to='reports/')
    generated_at = models.DateTimeField(auto_now_add=True)
    ai_insights = models.JSONField(null=True, blank=True)
    insights_updated_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-month', '-generated_at']

    def __str__(self):
        return f"Report {self.month.strftime('%Y-%m')} for {self.user.username}"
