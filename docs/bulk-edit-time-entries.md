# Req

PUT https://api.clockify.me/api/v1/workspaces/{workspaceId}/user/{userId}/time-entries

```json
[
  {
    "billable": false,
    "customFields": [
      {
        "customFieldId": "5e4117fe8c625f38930d57b7",
        "sourceType": "WORKSPACE",
        "value": "new value"
      }
    ],
    "description": "This is a sample time entry description.",
    "end": "2021-01-01T00:00:00Z",
    "id": "64c777ddd3fcab07cfbb210c",
    "projectId": "25b687e29ae1f428e7ebe123",
    "start": "2020-01-01T00:00:00Z",
    "tagIds": ["321r77ddd3fcab07cfbb567y", "44x777ddd3fcab07cfbb88f"],
    "taskId": "54m377ddd3fcab07cfbb432w",
    "type": "REGULAR"
  }
]
```

# Res

```json
[
  {
    "billable": false,
    "customFieldValues": [
      {
        "customFieldId": "5e4117fe8c625f38930d57b7",
        "name": "TIN",
        "timeEntryId": "64c777ddd3fcab07cfbb210c",
        "type": "WORKSPACE",
        "value": "20231211-12345"
      }
    ],
    "description": "This is a sample time entry description.",
    "id": "64c777ddd3fcab07cfbb210c",
    "isLocked": false,
    "kioskId": "94c777ddd3fcab07cfbb210d",
    "projectId": "25b687e29ae1f428e7ebe123",
    "tagIds": ["321r77ddd3fcab07cfbb567y", "44x777ddd3fcab07cfbb88f"],
    "taskId": "54m377ddd3fcab07cfbb432w",
    "timeInterval": {
      "duration": "8000",
      "end": "2021-01-01T00:00:00Z",
      "start": "2020-01-01T00:00:00Z"
    },
    "type": "BREAK",
    "userId": "5a0ab5acb07987125438b60f",
    "workspaceId": "64a687e29ae1f428e7ebe303"
  }
]
```
