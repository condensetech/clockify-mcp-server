# Req

DELETE https://api.clockify.me/api/v1/workspaces/{workspaceId}/user/{userId}/time-entries?time-entry-ids={id1},{id2}

# Res

200 — the deleted entries, in the same shape as get-user-time-entries:

```json
[
  {
    "id": "6ae8ca37869f6dbcb36d88b1",
    "description": "clockify-mcp bulk-delete probe (safe to delete)",
    "tagIds": null,
    "userId": "64621f9d6ea1a92bb6cb82f0",
    "billable": false,
    "taskId": null,
    "projectId": "6419c87a43175e0af35ec64a",
    "timeInterval": {
      "start": "2001-01-01T09:00:00Z",
      "end": "2001-01-01T09:01:00Z",
      "duration": "PT1M"
    }
  }
]
```

# All-or-nothing

Checked against the live API (2026-11-02): if any id is bad, the whole request fails with 400 and
**nothing** is deleted, including the valid ids.

```json
{
  "message": "Time entry with ID 000000000000000000000000 doesn't belong to Workspace",
  "code": 501
}
```
