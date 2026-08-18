# Req

GET https://api.clockify.me/api/v1/workspaces/{workspaceId}/projects

```json
[
  {
    "archived": false,
    "billable": false,
    "budgetEstimate": {
      "active": true,
      "estimate": 600000,
      "includeExpenses": false,
      "resetOption": "WEEKLY",
      "type": "AUTO"
    },
    "color": "#000000",
    "costRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "duration": "60000",
    "estimate": {
      "estimate": "PT1H30M",
      "type": "AUTO"
    },
    "hourlyRate": {
      "amount": 10500,
      "currency": "USD"
    },
    "id": "5b641568b07987035750505e",
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
    "name": "Software Development",
    "note": "This is a sample note for the project.",
    "public": false,
    "template": false,
    "timeEstimate": {
      "active": true,
      "estimate": "60000",
      "includeNonBillable": true,
      "resetOption": "WEEKLY",
      "type": "AUTO"
    },
    "workspaceId": "64a687e29ae1f428e7ebe303"
  }
]
```
