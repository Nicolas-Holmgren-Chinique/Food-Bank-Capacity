# CareSpace
## Product Requirements Document — Revision 0.1

**Working concept:** A real-time coordination layer connecting excess food, nonprofit capacity, logistics, and people experiencing food insecurity.

**Core proposition:**  
**“Space exists. Food exists. But the systems cannot see each other.”**

CareSpace makes them visible to each other—and gives both humans and AI agents a common interface through which they can coordinate.

---

# 1. Product Vision

Food insecurity is not solely a food-supply problem. It is also an **information, capacity, timing, access, and coordination problem**.

Food may exist while:

- a shelter does not know it is available;
- a donor does not know who can accept it;
- a kitchen does not have capacity at that moment;
- a delivery organization does not operate at the required time;
- transportation is unavailable;
- people needing food are outside the geographic service area;
- physical space exists but is not mapped;
- operating hours and delivery schedules are misaligned.

CareSpace will create a shared operational map of these resources and constraints.

The initial system focuses on three dimensions identified during discovery:

### Physical Access

**Question:** Where can food physically go?

Examples:

- shelter locations;
- food banks;
- community kitchens;
- refrigerators;
- distribution sites;
- temporary food locations;
- geographic service boundaries;
- transportation limitations.

The system must identify situations where people or resources fall **outside the normal boundaries of existing delivery systems.**

### Time Access

**Question:** When can the resource actually be used?

Examples:

- “We don't deliver after 7 PM.”
- kitchen operating hours;
- food-bank intake windows;
- volunteer availability;
- pickup windows;
- donor closing times;
- shelter meal schedules.

A resource that exists but cannot be accessed at the required time effectively has zero current capacity.

### Capacity Access

**Question:** How much can a location actually handle?

Examples:

- number of meals;
- kitchen throughput;
- refrigeration capacity;
- dry-storage capacity;
- number of people served;
- available beds;
- current occupancy;
- volunteer capacity;
- loading/unloading capacity.

CareSpace must therefore model **capacity as dynamic state**, rather than simply recording that a facility exists.

---

# 2. Product Thesis

CareSpace should operate as a **marketplace of supply, demand, capacity, and logistics**.

Instead of:

> Donor → Food Bank

CareSpace models:

> **Supply + Demand + Physical Access + Time Access + Capacity + Logistics → Match**

The objective is:

> **Right food → right place → right time.**

---

# 3. Primary Users

The platform should support several classes of participants.

### Food Suppliers

Organizations with potentially usable excess food:

- restaurants;
- grocery stores;
- institutional kitchens;
- corporate cafeterias;
- hotels;
- farms;
- event venues;
- schools;
- universities;
- food manufacturers;
- distributors.

### Recipient Organizations

Organizations capable of accepting or distributing food:

- shelters;
- food banks;
- soup kitchens;
- churches;
- community organizations;
- mutual-aid organizations;
- nonprofit distribution centers.

### Logistics Providers

Organizations or individuals capable of moving resources:

- nonprofit drivers;
- volunteers;
- delivery organizations;
- food-rescue organizations;
- municipal services;
- participating commercial logistics providers.

### CareSpace Operators

Users responsible for:

- system administration;
- verification;
- dispute resolution;
- organization onboarding;
- monitoring;
- data quality.

### AI Agents

AI agents must be treated as **first-class users of the platform**, not as an afterthought.

An authorized agent should ultimately be capable of discovering resources, querying capacity, reporting supply, identifying demand, proposing matches, and initiating permitted workflows.

---

# 4. Initial Product Architecture

CareSpace should consist of four major layers.

```text
                 CARESPACE

        ┌───────────────────────┐
        │      Web Interface    │
        │ Splash / Map / Portal│
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │    CareSpace API      │
        │ Human + Agent Access  │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │ CareSpace Application │
        │ Matching / Rules /    │
        │ Capacity / Logistics  │
        └───────────┬───────────┘
                    │
        ┌───────────▼───────────┐
        │ External Data Layer   │
        │ Database / Geo /      │
        │ Events / Integrations │
        └───────────────────────┘
```

The public website should **not contain the authoritative operational database**.

The frontend consumes the CareSpace API, while operational data resides in an independently hosted backend.

This separation allows the web interface, mobile clients, nonprofit systems, and autonomous agents to interact with the same underlying network.

---

# 5. Revision-One Website

The first website should establish the CareSpace concept while simultaneously functioning as the entry point into the network.

The initial landing page should communicate within seconds:

**There is food.  
There is need.  
CareSpace connects them.**

The page should contain four primary actions:

**I Have Food**

For donors reporting available food.

**I Need Food**

For organizations or authorized operators reporting demand.

**I Have Capacity**

For organizations reporting storage, kitchen, distribution, transportation, or service capacity.

**Explore the Network**

For viewing the geographic CareSpace network.

A secondary action should be available for:

**Connect an Agent**

---

# 6. Geographic Interface

Mapping should become one of the defining interfaces of CareSpace.

The map should eventually display:

- food supply;
- active food demand;
- shelters;
- food banks;
- kitchens;
- refrigeration;
- storage;
- distribution capacity;
- service boundaries;
- transportation resources;
- operating hours;
- current availability.

A future heat-map layer should visualize concentrations of:

**Supply**

**Demand**

**Capacity**

**Unserved need**

This makes geographic gaps immediately apparent.

---

# 7. Core Data Objects

The backend should begin with a relatively small but extensible domain model.

## Organization

```text
organization_id
name
organization_type
verification_status
contact
location
service_area
operating_hours
```

## Facility

```text
facility_id
organization_id
facility_type
location
service_area
operating_hours
access_constraints
```

## Capacity

```text
capacity_id
facility_id
capacity_type
maximum_capacity
available_capacity
unit
valid_from
valid_until
last_verified
```

Capacity types could include:

```text
refrigerated_storage
frozen_storage
dry_storage
kitchen
meal_service
transport
beds
volunteers
distribution
```

## Food Supply

```text
supply_id
supplier_id
food_type
quantity
unit
location
available_from
available_until
storage_requirement
pickup_required
status
```

## Food Demand

```text
demand_id
organization_id
food_type
quantity
people_to_serve
needed_from
needed_until
location
priority
status
```

## Logistics Resource

```text
logistics_id
provider_id
vehicle_type
capacity
service_area
available_from
available_until
requirements
```

## Match

```text
match_id
supply_id
demand_id
facility_id
logistics_id
match_score
status
created_at
```

---

# 8. Matching Engine

The matching engine is the central operational component.

A simplified match can be represented as:

```text
MATCH =
    food compatibility
  × geographic compatibility
  × time compatibility
  × facility capacity
  × logistics availability
  × recipient demand
```

A candidate match should answer:

1. Does someone need this food?
2. Can they accept this type of food?
3. Can they accept this quantity?
4. Are they open?
5. Can the food arrive before expiration?
6. Is transportation available?
7. Does the receiving location have capacity?
8. How many people can this transaction serve?

Later revisions can introduce optimization across multiple suppliers, recipients, vehicles, and delivery routes.

---

# 9. Agent-Native API

Agent communication should exist **from the first public release.**

CareSpace should publish machine-readable declarations describing the actions an agent may perform.

The API should initially expose capabilities conceptually equivalent to:

```text
GET  /api/v1/capabilities

GET  /api/v1/facilities
GET  /api/v1/capacity
GET  /api/v1/supply
GET  /api/v1/demand

POST /api/v1/supply
POST /api/v1/demand
POST /api/v1/capacity

POST /api/v1/matches/search
GET  /api/v1/matches/{id}
```

The exact API contract should be expressed through an OpenAPI specification.

---

# 10. Agent Declaration

The public site should expose a machine-readable description allowing an agent to determine immediately:

> “What can I do with CareSpace?”

For example, the declared capabilities could include:

```json
{
  "service": "CareSpace",
  "api_version": "1.0",
  "capabilities": [
    "discover_facilities",
    "query_capacity",
    "report_food_supply",
    "report_food_demand",
    "search_matches",
    "query_service_areas"
  ]
}
```

The architecture should deliberately separate:

**Discovery**

“What does CareSpace support?”

from:

**Authorization**

“What is this particular agent permitted to do?”

This distinction will become important as agents gain transactional capabilities.

---

# 11. Agent Authentication

Anonymous agents may receive public discovery information.

Authenticated agents should use scoped credentials.

Example scopes:

```text
carespace.read.facilities
carespace.read.supply
carespace.read.demand

carespace.write.supply
carespace.write.demand
carespace.write.capacity

carespace.match.create
carespace.logistics.commit
```

High-impact actions should require stronger authorization than simple discovery.

An agent should not automatically gain the ability to commit an organization to accepting food simply because it can query the CareSpace database.

---

# 12. Human + Agent Interaction Model

CareSpace should avoid creating separate networks for humans and agents.

Instead:

```text
                 CareSpace API
                      │
       ┌──────────────┼──────────────┐
       │              │              │
     Website       AI Agent      Partner API
       │              │              │
       └──────────────┼──────────────┘
                      │
                CareSpace Data
```

Everything operates against the same resource model.

A human reporting 200 meals and an authenticated restaurant agent reporting 200 meals should create equivalent supply objects.

---

# 13. Critical Requirement: Freshness

A major problem with capacity databases is stale information.

CareSpace therefore needs to distinguish:

```text
KNOWN CAPACITY
```

from:

```text
CURRENTLY AVAILABLE CAPACITY
```

Every operational record should have:

- source;
- timestamp;
- verification status;
- expiration or validity period.

For example:

> Community Kitchen A has refrigeration capacity for 500 meals.

is substantially different from:

> Community Kitchen A has capacity for approximately 180 additional refrigerated meals **right now**, verified 11 minutes ago.

The second is operationally useful.

---

# 14. Decision and Execution Separation

The whiteboard discovery work identifies an important workflow distinction:

**Decision-making**

versus

**Execution**

CareSpace should preserve this distinction.

A match may progress through states such as:

```text
DISCOVERED
      ↓
CANDIDATE
      ↓
PROPOSED
      ↓
ACCEPTED
      ↓
LOGISTICS ASSIGNED
      ↓
PICKED UP
      ↓
DELIVERED
      ↓
CONFIRMED
```

Agents may participate in different portions of this workflow depending upon their permissions.

---

# 15. Trust and Verification

Because CareSpace coordinates real-world resources, data provenance is essential.

Every important update should record:

```text
who reported it
when it was reported
how it was reported
whether it was verified
who/what verified it
```

Sources might include:

```text
organization_user
carespace_operator
authenticated_agent
partner_api
sensor/system integration
community_report
```

Community-sourced information can be valuable, but should be clearly distinguished from organization-verified information.

---

# 16. MVP Scope

Revision One should deliberately avoid trying to build the complete marketplace.

The MVP should prove three things:

### 1. Discovery

CareSpace can map organizations and resources.

### 2. Reporting

Humans and agents can report:

- available food;
- food demand;
- capacity.

### 3. Matching

CareSpace can identify plausible supply → capacity → demand matches.

The first release therefore needs:

- public splash page;
- CareSpace explanation;
- map interface;
- facility/resource database;
- supply reporting;
- demand reporting;
- capacity reporting;
- API;
- agent capability declaration;
- authentication framework;
- basic matching;
- administrative interface.

---

# 17. Explicitly Out of Scope for Revision One

The first release should **not** attempt to solve:

- sophisticated vehicle routing;
- automated payment;
- national identity infrastructure;
- autonomous purchasing;
- complex inventory management;
- warehouse-management replacement;
- full nonprofit CRM functionality;
- beneficiary medical/social-service records;
- comprehensive case management.

Those would substantially increase the product's regulatory, security, and implementation scope without proving the central hypothesis.

---

# 18. Privacy Principle

CareSpace should initially map **resources and organizational demand rather than vulnerable individuals.**

For example, the preferred model is:

> “Facility A currently needs approximately 140 dinners.”

rather than:

> “These 140 named individuals need dinner.”

Personally identifiable information about unhoused individuals should therefore not be required for the core food-matching system.

This dramatically reduces privacy exposure while still solving the logistical problem.

---

# 19. Revision-One User Journey

A restaurant has 120 prepared meals remaining at 6:15 PM.

The restaurant or its agent reports:

```text
120 prepared meals
available immediately
must be collected before 8 PM
requires refrigeration after pickup
```

CareSpace queries nearby demand.

A shelter needs approximately 100 meals.

However, the shelter cannot receive deliveries after 7 PM.

CareSpace finds another community kitchen:

```text
Demand: 150 meals
Receiving until: 9 PM
Available refrigerated capacity: 220 meals
Distance: 2.8 miles
```

A volunteer logistics provider is available.

CareSpace produces:

```text
SUPPLY
Restaurant
120 meals

        ↓

LOGISTICS
Available driver

        ↓

CAPACITY + DEMAND
Community Kitchen
120 meals accepted

        ↓

IMPACT
Approximately 120 meals redirected
```

That transaction represents the core CareSpace product.

---

# 20. Impact Metrics

CareSpace should instrument impact from the beginning.

Primary metrics:

```text
Meals redirected
Food weight rescued
People served
Matches completed
Food waste avoided
Time from supply report → match
Match → pickup time
Pickup → delivery time
Unused capacity discovered
Unmet demand
```

Network metrics should include:

```text
Active suppliers
Active recipient organizations
Active facilities
Active logistics providers
Agent-generated transactions
Human-generated transactions
Capacity utilization
Match completion rate
```

---

# 21. Website Messaging

The website should avoid presenting CareSpace simply as another charity directory.

The stronger message is:

# Food exists. Need exists.
## CareSpace connects them.

Supporting copy:

> CareSpace maps food, need, capacity, and logistics in real time—helping communities move available resources to the places that can use them.

A second important message:

> **See what exists. See what is needed. See what can move.**

And the agent-facing proposition:

> **Built for people. Accessible to agents.**

---

# 22. Revision-One Homepage Structure

```text
NAVIGATION
CareSpace | Map | Organizations | Developers | About

------------------------------------------------

HERO

Food exists.
Need exists.

CareSpace connects them.

[Find Food] [Offer Food] [Explore the Map]

------------------------------------------------

LIVE NETWORK

Interactive CareSpace map

Supply | Demand | Capacity

------------------------------------------------

HOW IT WORKS

1. Report
2. Match
3. Move
4. Confirm

------------------------------------------------

FOR ORGANIZATIONS

I have food
I need food
I have capacity
I can transport

------------------------------------------------

AGENT API

Connect your agent to CareSpace.

[API Documentation]
[View Capabilities]

------------------------------------------------

IMPACT

Meals Redirected
People Served
Active Organizations
Available Capacity

------------------------------------------------

ABOUT / PARTNERS / CONTACT
```

---

# 23. Technical Direction for Revision One

A reasonable initial architecture is:

```text
Web Application
      │
      ▼
API Gateway
      │
      ▼
CareSpace Backend
      │
 ┌────┼─────────┐
 │    │         │
 ▼    ▼         ▼
SQL   Geo      Event/
DB    Layer    Queue
 │
 ▼
External integrations
```

The frontend should remain effectively stateless with respect to authoritative operational information.

The backend becomes the source of truth.

This allows CareSpace eventually to support:

```text
carespace.org
mobile applications
partner nonprofit systems
municipal systems
restaurant integrations
AI agents
autonomous logistics systems
```

without rebuilding the underlying platform.

---

# 24. Product Principle

The central design principle coming from the discovery work should remain visible throughout development:

> **CareSpace does not merely map where resources are. It maps whether those resources are usable right now.**

That means every significant resource should eventually be evaluated across:

**WHERE — Physical Access**

**WHEN — Time Access**

**HOW MUCH — Capacity Access**

Once those three dimensions are combined with **supply and demand**, CareSpace becomes substantially more useful than a conventional nonprofit directory.

---

# 25. Definition of Success for Revision One

Revision One succeeds when the system can demonstrate the following end-to-end workflow:

```text
Food becomes available
        ↓
CareSpace learns about it
        ↓
CareSpace identifies current demand
        ↓
CareSpace checks time + location + capacity
        ↓
CareSpace proposes a viable destination
        ↓
Human or authorized agent accepts
        ↓
Food moves
        ↓
Delivery is confirmed
        ↓
Capacity + supply + demand update
```

If CareSpace can reliably execute that loop—even across a small pilot network—the core product hypothesis has been demonstrated.

---

## Product North Star

**CareSpace is the real-time coordination layer for community resources.**

The first use case is food insecurity, connecting excess food with organizations that have both **need and actual capacity to receive it**.

The longer-term platform opportunity is larger: the same physical-access, time-access, capacity-access, supply-and-demand model can coordinate other scarce community resources.

But Revision One should remain sharply focused:

> **Find available food. Find real capacity. Match them. Move the food.**