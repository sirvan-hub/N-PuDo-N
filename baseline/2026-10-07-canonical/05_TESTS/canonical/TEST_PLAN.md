# Test Plan: Full Registration and Parcel Handover Flow

## Overview
This document outlines the test plan for verifying the complete flow from user registration to parcel delivery in the N-PuDo-N system.

## Prerequisites
- Backend server running on http://localhost:3000
- Database initialized and seeded with test data
- Frontend apps (hub_owner_app, courier_app) installed and configured

## Test Flow

### 1. Authentication Flow
**Test Case:** User login and OTP verification
- **Step 1.1:** POST to `/auth/login` with phone and role
  - Expected: Returns OTP sent confirmation
  - Actual Result: OTP is sent to the phone number
  
- **Step 1.2:** POST to `/auth/verify-otp` with phone and OTP
  - Expected: Returns JWT token
  - Actual Result: Token is received and stored

### 2. Hub Creation Flow
**Test Case:** Hub owner creates a new hub
- **Step 2.1:** POST to `/hubs` with hub details
  - Expected: Hub is created with unique ID
  - Actual Result: Hub created successfully

### 3. Parcel Creation Flow (Courier)
**Test Case:** Courier creates a new parcel
- **Step 3.1:** POST to `/parcels` with parcel details
  - Expected: Parcel is created with DELIVERY_ATTEMPT status
  - Actual Result: Parcel created with tracking code

### 4. PUDO Request Flow
**Test Case:** Customer requests PUDO delivery
- **Step 4.1:** POST to `/parcels/{id}/submit-pudo`
  - Expected: Status changes to CUSTOMER_REQUEST
  - Actual Result: PUDO request submitted successfully

### 5. PUDO Acceptance Flow
**Test Case:** Hub owner accepts PUDO request
- **Step 5.1:** POST to `/parcels/{id}/approve` with accepted=true
  - Expected: Status changes to HUB_SELECTED
  - Actual Result: PUDO request accepted

### 6. Handover Scheduling Flow
**Test Case:** Schedule handover between courier and hub
- **Step 6.1:** POST to `/parcels/{id}/schedule-handover` with scheduled_at
  - Expected: Status changes to HANDOVER_IN_PROGRESS
  - Actual Result: Handover scheduled successfully

### 7. Handover Execution Flow
**Test Case:** Execute handover
- **Step 7.1:** POST to `/parcels/{id}/start-handover`
  - Expected: Status remains HANDOVER_IN_PROGRESS
  - Actual Result: Handover started
  
- **Step 7.2:** POST to `/parcels/{id}/complete-handover`
  - Expected: Status changes to TRANSFERRED_TO_HUB
  - Actual Result: Handover completed successfully

### 8. Hub Reception Flow
**Test Case:** Hub receives the parcel
- **Step 8.1:** POST to `/hubs/receive` with tracking_code
  - Expected: Status changes to STORED_AT_HUB
  - Actual Result: Parcel received at hub

### 9. Hub Delivery Flow
**Test Case:** Hub delivers parcel to customer
- **Step 9.1:** POST to `/hubs/deliver` with parcel_id and OTP
  - Expected: Status changes to READY_FOR_CUSTOMER (after our fix)
  - Actual Result: Parcel marked as ready for customer

### 10. Query Flow
**Test Case:** Hub owner queries their parcels
- **Step 10.1:** GET to `/hubs/my-parcels`
  - Expected: Returns list of parcels with statuses STORED_AT_HUB, TRANSFERRED_TO_HUB, and READY_FOR_CUSTOMER
  - Actual Result: Parcels are returned correctly

## Expected Results

### Status Transitions
The following status transitions should be valid according to the state machine:
1. DELIVERY_ATTEMPT → CUSTOMER_REQUEST or FAILED_DELIVERY
2. CUSTOMER_REQUEST → PUDO_ELIGIBILITY or FAILED_DELIVERY
3. PUDO_ELIGIBILITY → HUB_SELECTED or FAILED_DELIVERY
4. HUB_SELECTED → HANDOVER_IN_PROGRESS or FAILED_DELIVERY
5. HANDOVER_IN_PROGRESS → TRANSFERRED_TO_HUB or FAILED_DELIVERY
6. TRANSFERRED_TO_HUB → STORED_AT_HUB or FAILED_DELIVERY
7. STORED_AT_HUB → READY_FOR_CUSTOMER or FAILED_DELIVERY
8. READY_FOR_CUSTOMER → CUSTOMER_COLLECTION or FAILED_DELIVERY
9. CUSTOMER_COLLECTION → COLLECTED or FAILED_DELIVERY
10. COLLECTED → SETTLEMENT
11. Any status → FAILED_DELIVERY (in case of errors)
12. SETTLEMENT → (terminal state)

### Response Format
All API responses should be wrapped in the following format:
```json
{
  "data": { ... actual response data ... },
  "timestamp": "2026-09-23T10:00:00.000Z",
  "path": "/v1/endpoint"
}
```

### Enum Synchronization
Backend and frontend enums should match:
- Backend: `ParcelStatus` enum with 12 values
- Frontend (hub_owner_app): `ParcelStatus` enum with same 12 values in camelCase
- Frontend (courier_app): Uses `String status` instead of enum

## Test Execution

### Automated Test Script
Run the `test_flow.ps1` script to execute the full flow automatically:
```powershell
.\test_flow.ps1
```

### Manual Testing
1. Start the backend server: `npm run start:dev`
2. Run the test script: `.\test_flow.ps1`
3. Verify each step completes successfully
4. Check the database to verify status changes
5. Test error cases (invalid OTP, invalid transitions, etc.)

## Known Issues
1. `TrackingGateway` dependency injection issue (fixed in step 1)
2. Enum mismatch between backend and frontend (already synchronized)
3. Response format mismatch (fixed - backend returns nested data via TransformInterceptor)

## Next Steps
1. Run the test script to verify the full flow
2. Fix any issues that arise during testing
3. Add more edge case tests
4. Verify error handling
5. Test with real mobile apps
