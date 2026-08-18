# Clockify API (v1)

## Introduction

By using this REST API, you can easily integrate Clockify with your own add-ons, push and pull data between Clockify and other tools, and create custom add-ons on [CAKE.com Marketplace](https://marketplace.cake.com). Whether you’re looking to automate time tracking, generate custom reports, or build other custom integrations, our API provides the flexibility and power you need to get the job done. If you have any questions or run into any issues while using our API, don’t hesitate to reach out to us for help. You can also post questions on Stack Overflow with the Clockify tag to get help from the community.

## Authentication

To authenticate your requests to your API, make sure to include either the ‘X-Api-Key’ or the ‘X-Addon-Token’ in the request header, containing your API or Addon key. If your workspace is on a subdomain (e.g. subdomain.clockify.me), you’ll need to generate a new API key in your Profile Settings that will work specifically for that workspace. This ensures that you’re accessing data from the correct workspace and helps maintain the security of your data.

## Webhooks

Webhooks can enhance your workflow by keeping your add-on up-to-date with the latest changes in Clockify. With Clockify’s webhooks you can receive real-time notifications when certain events such as starting a timer or deleting a time entry occur in Clockify. Depending on the workspace plan, workspace owners and admins can create:

- Up to 3 webhooks on **FREE** plan
- Up to 10 webhooks per user, with a total of 100 webhooks per entire workspace on **BASIC**, **STANDARD** and **PRO** plans
- Up to 100 webhooks per user, with a total of 300 webhooks per entire workspace on **ENTERPRISE** plan

## Rate limiting

Our REST API has a specific rate limit of 50 requests per second (by addon on one workspace) when accessed using X-Addon-Token. Exceeding this limit will result in an error message with the description "Too many requests".

## Pagination

Our REST API supports pagination for all synchronous GET endpoints that retrieve lists of entities. When an endpoint accepts the `page` and `pageSize` query parameters, it will return a paginated response.

To control the data returned in a paginated request, you can use the following optional query parameters.

- **page** (integer): The page number you wish to retrieve. This is 1-indexed. If this parameter is omitted, the API will default to the first page (page=1).
- **pageSize** (integer): The number of items to include on each page. If this parameter is omitted, a default page size will be used.

Every response from an endpoint that supports these parameters will include a custom `Last-Page` header. This header provides a simple way to determine if you have reached the end of the data set.

- **true:** The current page is the final page; no more data is available.
- **false:** Additional pages can be fetched.

## API URLs

Refer to the list on what URL to use base on the subdomain and data region settings of your workspace.

- Global - can be used by workspaces with or without subdomain.

  - Regular: [https://api.clockify.me/api/v1/file/image](https://api.clockify.me/api/v1/file/image)
  - Reports: [https://reports.api.clockify.me/v1/workspaces/{workspaceId}/reports/detailed](https://reports.api.clockify.me/v1/workspaces/%7BworkspaceId%7D/reports/detailed)

- Regional

  - Non-subdomain

    - Regular: [https://euc1.clockify.me/api/v1/file/image](https://euc1.clockify.me/api/v1/file/image)
    - Reports: [https://use2.clockify.me/report/v1/workspaces/{workspaceId}/reports/detailed](https://use2.clockify.me/report/v1/workspaces/%7BworkspaceId%7D/reports/detailed)

  - Subdomain

    - Regular: [https://euc1.clockify.me/api/v1/file/image](https://euc1.clockify.me/api/v1/file/image)
    - Reports: [https://yoursubdomainname.clockify.me/report/v1/workspaces/{workspaceId}/reports/detailed](https://yoursubdomainname.clockify.me/report/v1/workspaces/%7BworkspaceId%7D/reports/detailed)

- Developer

  - Regular: [https://developer.clockify.me/api/v1/file/image](https://developer.clockify.me/api/v1/file/image)
  - Reports: [https://developer.clockify.me/report/v1/workspaces/{workspaceId}/reports/detailed](https://developer.clockify.me/report/v1/workspaces/%7BworkspaceId%7D/reports/detailed)

## Regional Server Prefixes

If your workspace is in a specific region, you need to change your URL prefix to access v1 API endpoints. For example, this is how **backend** api v1/file/image endpoint would look in EU region: [https://euc1.clockify.me/api/v1/file/image](https://euc1.clockify.me)

Below are the available regional server prefixes:

- **EU (Germany)**: euc1
- **USA**: use2
- **UK**: euw2
- **AU**: apse2
