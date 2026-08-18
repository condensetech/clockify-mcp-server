# Req

POST https://api.clockify.me/api/v1/workspaces

# Res

```json
[
  {
    "cakeOrganizationId": "67d471fb56aa9668b7bfa295",
    "costRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "currencies": [
      {
        "code": "USD",
        "id": "5b641568b07987035750505e",
        "isDefault": true
      }
    ],
    "featureSubscriptionType": "STANDARD_2021",
    "features": ["ADD_TIME_FOR_OTHERS", "ADMIN_PANEL", "ALERTS", "APPROVAL"],
    "hourlyRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "id": "64a687e29ae1f428e7ebe303",
    "imageUrl": "https://www.url.com/imageurl-1234567890.jpg",
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
    "name": "Cool Company",
    "subdomain": {
      "enabled": false,
      "name": "coolcompany"
    },
    "workspaceSettings": {
      "activeBillableHours": false,
      "adminOnlyPages": "[\"PROJECT\",\"TEAM\",\"REPORTS\"]",
      "approvalSettings": {
        "approvalEnabled": false,
        "approvalPeriod": "WEEKLY",
        "approvalRoles": ["ADMIN"]
      },
      "auditLogSettings": {
        "auditEnabled": false,
        "clientAuditing": false,
        "clientStartedRecording": "2020-06-01T08:00:00Z",
        "expensesAuditing": false,
        "expensesStartedRecording": "2020-06-01T08:00:00Z",
        "projectAuditing": false,
        "projectStartedRecording": "2020-06-01T08:00:00Z",
        "tagAuditing": false,
        "tagStartedRecording": "2020-06-01T08:00:00Z",
        "timeEntryAuditing": false,
        "timeEntryStartedRecording": "2020-06-01T08:00:00Z"
      },
      "automaticLock": {
        "changeDay": "FRIDAY",
        "dayOfMonth": 15,
        "firstDay": "MONDAY",
        "olderThanPeriod": "DAYS",
        "olderThanValue": 5,
        "type": "WEEKLY"
      },
      "breakSettings": {
        "breaksEnabled": false,
        "defaultBreakEntities": {
          "projectId": "string",
          "taskId": "string"
        }
      },
      "canManagerEditUsersTime": false,
      "canManagerLaunchKiosk": false,
      "canSeeTimeSheet": false,
      "canSeeTracker": false,
      "companyAddress": "string",
      "currencyFormat": "CURRENCY_SPACE_VALUE",
      "customLabels": {
        "projectGroupingLabel": "string",
        "projectLabel": "string",
        "taskLabel": "string"
      },
      "decimalFormat": false,
      "defaultBillableProjects": false,
      "durationFormat": "FULL",
      "entityCreationPermissions": {
        "whoCanCreateProjectsAndClients": "ADMINS",
        "whoCanCreateTags": "ADMINS",
        "whoCanCreateTasks": "ADMINS"
      },
      "expenseApprovalSettings": {
        "approvalEnabled": false,
        "approvalPeriod": "WEEKLY",
        "approvalRoles": ["ADMIN"]
      },
      "expensesEnabled": false,
      "favoriteEntriesEnabled": false,
      "forceDescription": false,
      "forceProjects": false,
      "forceTags": false,
      "forceTasks": false,
      "highResolutionScreenshots": false,
      "invoicingEnabled": false,
      "isCostRateActive": false,
      "isProjectPublicByDefault": true,
      "kioskAuthType": "PIN_4_DIGITS",
      "kioskAutologinEnabled": false,
      "kioskEnabled": false,
      "kioskPhotoCaptureEnabled": false,
      "kioskProjectsAndTasksEnabled": false,
      "locationsEnabled": false,
      "lockTimeEntries": "2024-02-25T23:00:00Z",
      "lockTimeZone": "Europe/Belgrade",
      "multiFactorEnabled": false,
      "numberFormat": "COMMA_PERIOD",
      "onlyAdminsCanChangeBillableStatus": false,
      "onlyAdminsCreateProject": false,
      "onlyAdminsCreateTag": false,
      "onlyAdminsCreateTask": false,
      "onlyAdminsSeeAllTimeEntries": false,
      "onlyAdminsSeeBillableRates": false,
      "onlyAdminsSeeDashboard": false,
      "onlyAdminsSeeProjectStatus": false,
      "onlyAdminsSeePublicProjectsEntries": false,
      "overtimeCalculationPeriod": "DAILY",
      "projectFavorites": false,
      "projectGroupingLabel": "Project Label",
      "projectLabel": "string",
      "projectPickerSpecialFilter": false,
      "round": {
        "minutes": "15",
        "round": "Round to nearest"
      },
      "schedulingEnabled": false,
      "schedulingSettings": {
        "canSeeBillableAndCostAmount": false,
        "enabled": false,
        "everyoneCanSeeAllAssignments": false,
        "whoCanCreateAssignments": "ADMINS_AND_PROJECT_MANAGERS"
      },
      "screenshotsEnabled": false,
      "taskBillableEnabled": false,
      "taskLabel": "string",
      "taskRateEnabled": false,
      "timeApprovalEnabled": false,
      "timeOff": {
        "active": false,
        "regularUserCanSeeOtherUsersTimeOff": false,
        "showDefaultPoliciesMessageToUsers": ["string"]
      },
      "timeRoundingInReports": false,
      "timeTrackingMode": "DEFAULT",
      "timeViewMode": "TIME_SENSITIVE_VIEW",
      "trackTimeDownToSecond": false,
      "weekStart": "MONDAY",
      "whitelistedForAggregateView": false,
      "workCapacity": "string",
      "workingDays": ["MONDAY"]
    }
  }
]
```
