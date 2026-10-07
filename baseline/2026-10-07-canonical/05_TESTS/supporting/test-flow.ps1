# Test Flow for Courier App
# This script simulates the test flow for the courier application

// Simulate parcel creation and delivery flow
async function runTestFlow() {
    console.log("=== Testing Courier App Flow ===");
    
    // Step 1: Create a parcel
    const parcel = await ParcelService.create({
        tracking_code: "TRK-2026-001",
        recipient_name: "Ahmed Khan",
        recipient_phone: "+913-123-456-7890",
        base_post_cost: 5000,
        proposed_hub_id: "HUB-01"
    });
    console.log("Created parcel:", parcel.id);
    
    // Step 2: Receive parcel at hub
    const received = await ParcelService.receiveAtHub("TRK-2026-001");
    console.log("Received parcel:", received.id, "Status:", received.status);
    
    // Step 3: Deliver to customer
    const delivered = await ParcelService.deliver("TRK-2026-001");
    console.log("Delivered parcel:", delivered.id, "Status:", delivered.status);
    
    // Step 4: Check settlement
    const settled = await ParcelService.settlement("TRK-2026-001");
    console.log("Settled transaction:", settled.id);
    
    console.log("=== Test Flow Complete ===");
}

// Execute the test flow
runTestFlow().catch(console.error);
