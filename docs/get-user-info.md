# Req

GET https://api.clockify.me/api/v1/user

# Res

```json
{
  "activeWorkspace": "64a687e29ae1f428e7ebe303",
  "customFields": [
    {
      "customFieldId": "5e4117fe8c625f38930d57b7",
      "customFieldName": "TIN",
      "customFieldType": "TXT",
      "userId": "5a0ab5acb07987125438b60f",
      "value": "20231211-12345"
    }
  ],
  "defaultWorkspace": "64a687e29ae1f428e7ebe303",
  "email": "johndoe@example.com",
  "id": "5a0ab5acb07987125438b60f",
  "memberships": [
    {
      "costRate": {
        "amount": 10500,
        "currency": "USD"
      },
      "hourlyRate": {
        "amount": 10500,
        "currency": "USD"
      },
      "membershipStatus": "PENDING",
      "membershipType": "PROJECT",
      "targetId": "64c777ddd3fcab07cfbb210c",
      "userId": "5a0ab5acb07987125438b60f"
    }
  ],
  "name": "John Doe",
  "profilePicture": "https://www.url.com/profile-picture1234567890.png",
  "settings": {
    "alerts": true,
    "approval": false,
    "collapseAllProjectLists": true,
    "dashboardPinToTop": true,
    "dashboardSelection": "ME",
    "dashboardViewType": "BILLABILITY",
    "dateFormat": "MM/DD/YYYY",
    "groupSimilarEntriesDisabled": true,
    "invoiceReminders": false,
    "isCompactViewOn": false,
    "lang": "en",
    "longRunning": true,
    "multiFactorEnabled": true,
    "myStartOfDay": "09:00",
    "onboarding": false,
    "projectListCollapse": 15,
    "projectPickerTaskFilter": false,
    "pto": true,
    "reminders": false,
    "scheduledReports": true,
    "scheduling": false,
    "sendNewsletter": false,
    "showOnlyWorkingDays": false,
    "summaryReportSettings": {
      "group": "PROJECT",
      "subgroup": "CLIENT"
    },
    "theme": "DARK",
    "timeFormat": "HOUR24",
    "timeTrackingManual": true,
    "timeZone": "Asia/Aden",
    "weekStart": "MONDAY",
    "weeklyUpdates": false
  },
  "status": "ACTIVE"
}
```
