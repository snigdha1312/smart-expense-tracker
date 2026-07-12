import os
from celery import Celery

# Set the default Django settings module for the 'celery' program.
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'expense_tracker.settings')

app = Celery('expense_tracker')

# Using a string here means the worker doesn't have to serialize
# the configuration object to child processes.
# - namespace='CELERY' means all celery-related configuration keys
#   should have a `CELERY_` prefix.
app.config_from_object('django.conf:settings', namespace='CELERY')

# Load task modules from all registered Django apps.
app.autodiscover_tasks()

@app.task(bind=True, ignore_result=False)
def debug_task(self):
    print(f'Request: {self.request!r}')
    return "Celery is working!"

from celery.schedules import crontab

app.conf.beat_schedule = {
    'generate-monthly-reports-first-of-month': {
        'task': 'core.tasks.generate_monthly_reports_for_all_users',
        'schedule': crontab(day_of_month='1', hour='0', minute='0'),
    },
}

