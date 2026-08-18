# Req

GET https://api.clockify.me/api/v1/workspaces/{workspaceId}/projects/{projectId}/tasks

```json
[
  {
    "assigneeId": "string",
    "assigneeIds": ["45b687e29ae1f428e7ebe123", "67s687e29ae1f428e7ebe678"],
    "billable": false,
    "budgetEstimate": 10000,
    "costRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "duration": "PT1H30M",
    "estimate": "PT1H30M",
    "hourlyRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "id": "57a687e29ae1f428e7ebe107",
    "name": "Bugfixing",
    "projectId": "25b687e29ae1f428e7ebe123",
    "status": "DONE",
    "userGroupIds": ["67b687e29ae1f428e7ebe123", "12s687e29ae1f428e7ebe678"]
  }
]
```
