from django.urls import path, include
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView
from rest_framework.routers import DefaultRouter
from .views import (
    HealthCheckView, 
    RegisterView, 
    UserMeView,
    CategoryViewSet,
    TransactionViewSet,
    BudgetViewSet,
    AnalyticsViewSet,
    TestCeleryView,
    ReceiptViewSet,
    MonthlyReportViewSet,
    AIInsightsView
)

router = DefaultRouter()
router.register(r'categories', CategoryViewSet, basename='category')
router.register(r'transactions', TransactionViewSet, basename='transaction')
router.register(r'budgets', BudgetViewSet, basename='budget')
router.register(r'analytics', AnalyticsViewSet, basename='analytics')
router.register(r'receipts', ReceiptViewSet, basename='receipt')
router.register(r'reports', MonthlyReportViewSet, basename='report')

urlpatterns = [
    # Health Check
    path('health/', HealthCheckView.as_view(), name='health_check'),
    
    # Authentication
    path('auth/register/', RegisterView.as_view(), name='auth_register'),
    path('auth/login/', TokenObtainPairView.as_view(), name='auth_login'),
    path('auth/refresh/', TokenRefreshView.as_view(), name='auth_refresh'),
    path('auth/me/', UserMeView.as_view(), name='auth_me'),
    
    # Celery Testing
    path('test-celery/', TestCeleryView.as_view(), name='test_celery'),
    
    # API ViewSets
    path('insights/', AIInsightsView.as_view(), name='insights'),
    path('', include(router.urls)),
]
