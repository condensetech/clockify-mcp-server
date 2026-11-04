# Clockify MCP

A server that lets a user create, list and delete their Clockify time entries by asking an agent.
The language is Clockify's own ([Clockify glossary](https://clockify.me/help/getting-started/clockify-glossary));
this file only picks between synonyms and fills in where Clockify says nothing.

## Who and where

**Workspace**:
A collection of people and projects in Clockify. Every other thing in this glossary lives in exactly
one workspace.
_Avoid_: Account, organisation, team

**Active workspace**:
The workspace the user currently has selected in Clockify.
_Avoid_: Default workspace (a separate Clockify setting), current workspace

**User**:
A person who tracks their own time in a workspace. Here, always the owner of the API key.
_Avoid_: Account, me, employee

## What time is logged to

**Client**:
The customer a project is done for. A project has at most one; a client never attaches to a time
entry directly, only through its project.
_Avoid_: Customer, company

**Project**:
A grouping of time entries that belong to the same kind of work. A project's name is unique only
within its client, so a project is identified by its name together with its client.
_Avoid_: Job, engagement, account

**Public project**:
A project every user in the workspace can log time to, whether or not they are a member.
_Avoid_: Open project, shared project

**Private project**:
A project only its members can log time to.
_Avoid_: Restricted project, hidden project

**Member**:
A user who has been given access to a project, directly or through a group they belong to.
_Avoid_: Assigned to a project, project user, participant

**Group**:
A named set of users in a workspace that can be given access to a project as a whole.
_Avoid_: Team (Clockify's name for the workspace's users), user group, department

**Active project**:
A project that is not archived. Only active projects take new time entries.
_Avoid_: Open project, current project

**Task**:
A subdivision of a project, such as a job type, phase or milestone. A task belongs to exactly one
project, and a time entry can only name a task of its own project.
_Avoid_: Subproject, activity, ticket

**Assignee**:
A user a task has been assigned to. Assignment applies to tasks only; for a project, the user is a
member.
_Avoid_: Task member, owner

## Time

**Time entry**:
One block of a user's time: a start and an end, and optionally a project, a task, a description,
and the billable flag. "Entry" on its own is fine as a short form.
_Avoid_: Log, record, booking, timesheet entry

**Log time**:
To create finished time entries for work already done, giving each one a start and an end. Clockify
calls this adding time in manual mode.
_Avoid_: Track time (Clockify's broader verb, which also covers the timer), book, add hours

**Timer**:
Clockify's way of tracking time live: starting it creates a running time entry, and stopping it
gives that entry its end.
_Avoid_: Stopwatch, clock

**Running time entry**:
A time entry whose timer is still going. It has a start but no end, so it has no duration yet.
_Avoid_: Open entry, active entry, in-progress entry

**Description**:
The free-text note on a time entry saying what the work was. Optional.
_Avoid_: Notes, comment, title, memo

**Billable**:
Whether a time entry's time is charged to the client. Each time entry carries its own flag, and its
project supplies the default.
_Avoid_: Chargeable, invoiceable

**Duration**:
How long a time entry lasts: its end minus its start.
_Avoid_: Hours (that is a unit), length, time spent

**Profile time zone**:
The time zone set in the user's Clockify profile. Every date and time the user gives or reads here
is in it.
_Avoid_: Local time, local timezone (whose: the machine's?), user timezone, server time

**Entry date**:
The day, in the profile time zone, on which a time entry starts, even if the entry ends after
midnight.
_Avoid_: Day (on its own), work date
