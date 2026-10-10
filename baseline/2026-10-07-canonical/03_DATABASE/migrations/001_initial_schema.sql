-- Initial schema for N-PuDo-N
-- Run this migration on PostgreSQL

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Users table
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phone VARCHAR(15) UNIQUE NOT NULL,
    full_name VARCHAR(100),
    national_id VARCHAR(10),
    password VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'RECIPIENT' CHECK (role IN ('RECIPIENT', 'COURIER', 'HUB_OWNER', 'ADMIN', 'SUPER_ADMIN', 'AMBASSADOR')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_verified BOOLEAN NOT NULL DEFAULT false,
    verified_by UUID,
    verified_at TIMESTAMP WITH TIME ZONE,
    failed_login_attempts INT NOT NULL DEFAULT 0,
    locked_until TIMESTAMP WITH TIME ZONE,
    last_login_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_users_phone ON users(phone);
CREATE INDEX idx_users_role ON users(role);

-- Hubs table
CREATE TABLE hubs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    owner_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(150) NOT NULL,
    description TEXT,
    phone VARCHAR(15),
    address TEXT NOT NULL,
    city VARCHAR(50) NOT NULL,
    district VARCHAR(50),
    operating_hours JSONB,
    max_capacity INT NOT NULL DEFAULT 100,
    current_capacity INT NOT NULL DEFAULT 0,
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_temporarily_closed BOOLEAN NOT NULL DEFAULT false,
    qr_code_hash VARCHAR(64) UNIQUE NOT NULL,
    rating DECIMAL(2,1) NOT NULL DEFAULT 0.0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_hubs_owner_id ON hubs(owner_id);
CREATE INDEX idx_hubs_city ON hubs(city);
CREATE INDEX idx_hubs_qr_code_hash ON hubs(qr_code_hash);
CREATE INDEX idx_hubs_is_active ON hubs(is_active);

-- Parcels table
CREATE TABLE parcels (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tracking_code VARCHAR(50) UNIQUE NOT NULL,
    recipient_phone VARCHAR(15) NOT NULL,
    recipient_name VARCHAR(100) NOT NULL,
    recipient_address TEXT NOT NULL,
    base_post_cost INT NOT NULL,
    proposed_hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DELIVERY_ATTEMPT' CHECK (status IN ('PENDING_APPROVAL', 'DELIVERY_ATTEMPT', 'CUSTOMER_REQUEST', 'FAILED_DELIVERY', 'PUDO_ELIGIBILITY', 'HUB_SELECTED', 'HANDOVER_IN_PROGRESS', 'TRANSFERRED_TO_HUB', 'STORED_AT_HUB', 'READY_FOR_CUSTOMER', 'CUSTOMER_COLLECTION', 'COLLECTED', 'DELIVERED', 'SETTLEMENT')),
    weight_kg DECIMAL(10,3),
    description TEXT,
    delivered_at TIMESTAMP WITH TIME ZONE,
    delivered_to_hub_at TIMESTAMP WITH TIME ZONE,
    approved_at TIMESTAMP WITH TIME ZONE,
    handover_scheduled_at TIMESTAMP WITH TIME ZONE,
    handover_completed_at TIMESTAMP WITH TIME ZONE,
    transferred_to_hub_at TIMESTAMP WITH TIME ZONE,
    ready_for_pickup_at TIMESTAMP WITH TIME ZONE,
    out_for_delivery_at TIMESTAMP WITH TIME ZONE,
    returned_at TIMESTAMP WITH TIME ZONE,
    expired_at TIMESTAMP WITH TIME ZONE,
    cancelled_at TIMESTAMP WITH TIME ZONE,
    version INTEGER NOT NULL DEFAULT 1,
    rejected_reason TEXT,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_parcels_tracking_code ON parcels(tracking_code);
CREATE INDEX idx_parcels_recipient_phone ON parcels(recipient_phone);
CREATE INDEX idx_parcels_proposed_hub_id ON parcels(proposed_hub_id);
CREATE INDEX idx_parcels_courier_id ON parcels(courier_id);
CREATE INDEX idx_parcels_status ON parcels(status);
CREATE INDEX idx_parcels_created_at ON parcels(created_at DESC);

-- Wallets table
CREATE TABLE wallets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    balance BIGINT NOT NULL DEFAULT 0,
    blocked_amount BIGINT NOT NULL DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallets_user_id ON wallets(user_id);

-- Tariff Versions table
CREATE TABLE tariff_versions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'INACTIVE', 'ARCHIVED')),
    fee_percentage_under_12h DECIMAL(5,2) NOT NULL DEFAULT 0.20,
    fee_percentage_under_24h DECIMAL(5,2) NOT NULL DEFAULT 0.40,
    fee_percentage_per_additional_24h DECIMAL(5,2) NOT NULL DEFAULT 0.50,
    threshold_12h_hours INT NOT NULL DEFAULT 12,
    threshold_24h_hours INT NOT NULL DEFAULT 24,
    description TEXT,
    effective_from TIMESTAMP WITH TIME ZONE,
    effective_until TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_tariff_version ON tariff_versions(version);
CREATE INDEX idx_tariff_status ON tariff_versions(status);

-- Invoices table
CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    invoice_number VARCHAR(50) UNIQUE NOT NULL,
    parcel_id UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    hub_id UUID NOT NULL REFERENCES hubs(id) ON DELETE CASCADE,
    base_post_cost INT NOT NULL,
    elapsed_hours DECIMAL(10,2) NOT NULL,
    fee_percentage DECIMAL(5,2) NOT NULL,
    calculated_fee BIGINT NOT NULL,
    total_amount BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED', 'REFUNDED')),
    hub_owner_share BIGINT NOT NULL,
    platform_fee BIGINT NOT NULL,
    tariff_version_id UUID REFERENCES tariff_versions(id) ON DELETE SET NULL,
    paid_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_parcel_id ON invoices(parcel_id);
CREATE INDEX idx_invoices_recipient_id ON invoices(recipient_id);
CREATE INDEX idx_invoices_hub_id ON invoices(hub_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- Wallet Transactions table
CREATE TABLE wallet_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    wallet_id UUID NOT NULL REFERENCES wallets(id) ON DELETE CASCADE,
    amount BIGINT NOT NULL,
    type VARCHAR(20) NOT NULL CHECK (type IN ('CREDIT', 'DEBIT', 'HOLD', 'RELEASE', 'REFUND')),
    reference_id UUID,
    reference_type VARCHAR(30),
    description TEXT,
    balance_after BIGINT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_wallet_transactions_wallet_id ON wallet_transactions(wallet_id);
CREATE INDEX idx_wallet_transactions_created_at ON wallet_transactions(created_at DESC);

-- Device Tokens table (for push notifications)
CREATE TABLE device_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token TEXT NOT NULL,
    platform VARCHAR(10) NOT NULL CHECK (platform IN ('android', 'ios', 'web')),
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_used_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_tokens_user_id ON device_tokens(user_id);
CREATE INDEX idx_device_tokens_token ON device_tokens(token);

-- Registration Transactions table
CREATE TABLE registration_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PUDO_REQUEST', 'PUDO_ACCEPT', 'PUDO_REJECT', 'HUB_SELECTION', 'OFFLINE_ASSIGNMENT')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
    metadata TEXT,
    rejection_reason TEXT,
    confirmed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_reg_txn_parcel_id ON registration_transactions(parcel_id);
CREATE INDEX idx_reg_txn_hub_id ON registration_transactions(hub_id);
CREATE INDEX idx_reg_txn_user_id ON registration_transactions(user_id);
CREATE INDEX idx_reg_txn_status ON registration_transactions(status);

-- Custody Transfers table
CREATE TABLE custody_transfers (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    from_hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    to_hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    courier_id UUID REFERENCES users(id) ON DELETE SET NULL,
    receiver_id UUID REFERENCES users(id) ON DELETE SET NULL,
    transfer_type VARCHAR(30) NOT NULL CHECK (transfer_type IN ('HANDOVER', 'TRANSFER_TO_HUB', 'RECEIVE_AT_HUB', 'DELIVER_TO_CUSTOMER', 'RETURN')),
    status VARCHAR(20) NOT NULL DEFAULT 'INITIATED' CHECK (status IN ('INITIATED', 'COMPLETED', 'FAILED', 'CANCELLED')),
    custody_code VARCHAR(6),
    metadata TEXT,
    failure_reason TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_custody_parcel_id ON custody_transfers(parcel_id);
CREATE INDEX idx_custody_from_hub ON custody_transfers(from_hub_id);
CREATE INDEX idx_custody_to_hub ON custody_transfers(to_hub_id);
CREATE INDEX idx_custody_courier ON custody_transfers(courier_id);
CREATE INDEX idx_custody_status ON custody_transfers(status);
CREATE INDEX idx_custody_code ON custody_transfers(custody_code);

-- Settlement Transactions table
CREATE TABLE settlement_transactions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id UUID NOT NULL REFERENCES parcels(id) ON DELETE CASCADE,
    hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    wallet_id UUID REFERENCES wallets(id) ON DELETE SET NULL,
    transaction_type VARCHAR(30) NOT NULL CHECK (transaction_type IN ('PAYMENT', 'REFUND', 'FEE_COLLECTION', 'HUB_OWNER_PAYOUT', 'PLATFORM_FEE', 'HOLD', 'RELEASE')),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED', 'CANCELLED')),
    amount BIGINT NOT NULL DEFAULT 0,
    balance_after BIGINT NOT NULL DEFAULT 0,
    hub_owner_share BIGINT NOT NULL DEFAULT 0,
    platform_fee BIGINT NOT NULL DEFAULT 0,
    metadata TEXT,
    failure_reason TEXT,
    completed_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_settlement_parcel_id ON settlement_transactions(parcel_id);
CREATE INDEX idx_settlement_hub_id ON settlement_transactions(hub_id);
CREATE INDEX idx_settlement_user_id ON settlement_transactions(user_id);
CREATE INDEX idx_settlement_wallet_id ON settlement_transactions(wallet_id);
CREATE INDEX idx_settlement_status ON settlement_transactions(status);
CREATE INDEX idx_settlement_type ON settlement_transactions(transaction_type);

-- Audit Logs table
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    entity_type VARCHAR(30) NOT NULL CHECK (entity_type IN ('PARCEL', 'HUB', 'USER', 'WALLET', 'INVOICE', 'REGISTRATION', 'CUSTODY', 'SETTLEMENT')),
    entity_id UUID NOT NULL,
    action VARCHAR(30) NOT NULL CHECK (action IN ('CREATE', 'UPDATE', 'DELETE', 'STATUS_CHANGE', 'HANDOVER', 'TRANSFER', 'DELIVER', 'COLLECT', 'SETTLE', 'REGISTER', 'VERIFY', 'LOGIN', 'LOGOUT')),
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    hub_id UUID REFERENCES hubs(id) ON DELETE SET NULL,
    description TEXT,
    metadata JSONB,
    ip_address VARCHAR(50),
    user_agent VARCHAR(50),
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX idx_audit_hub_id ON audit_logs(hub_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_created_at ON audit_logs(created_at DESC);

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_hubs_updated_at BEFORE UPDATE ON hubs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_parcels_updated_at BEFORE UPDATE ON parcels FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_wallets_updated_at BEFORE UPDATE ON wallets FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_device_tokens_updated_at BEFORE UPDATE ON device_tokens FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert default admin user (password: admin123 - hashed with bcrypt)
-- You should change this password immediately after first login!
INSERT INTO users (phone, full_name, national_id, password, role, is_active, is_verified)
VALUES ('09000000000', 'System Admin', '0000000000', '$2b$10$9OaxYjWDv3JXNTc8JTQdk.7AkTKHVfpFNCe3URgiRM/vS7KzTKdry', 'SUPER_ADMIN', true, true)
ON CONFLICT (phone) DO NOTHING;



