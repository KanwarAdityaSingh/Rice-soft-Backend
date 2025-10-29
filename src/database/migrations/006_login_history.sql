-- Migration: Create login_history table
-- Description: Tracks all user login attempts and successful logins

CREATE TABLE IF NOT EXISTS login_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    ip_address VARCHAR(45),
    user_agent TEXT,
    device_type VARCHAR(50),
    browser VARCHAR(100),
    operating_system VARCHAR(100),
    login_status VARCHAR(20) NOT NULL CHECK (login_status IN ('success', 'failed', 'blocked')),
    failure_reason VARCHAR(255),
    login_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
    -- Indexes for performance
    CONSTRAINT fk_login_history_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Create indexes for faster queries
CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_login_at ON login_history(login_at DESC);
CREATE INDEX IF NOT EXISTS idx_login_history_status ON login_history(login_status);
CREATE INDEX IF NOT EXISTS idx_login_history_user_status ON login_history(user_id, login_status);

-- Add comment to table
COMMENT ON TABLE login_history IS 'Stores all user login attempts and successful logins for security and auditing purposes';
COMMENT ON COLUMN login_history.login_status IS 'Status of login attempt: success, failed, or blocked';
COMMENT ON COLUMN login_history.failure_reason IS 'Reason for failed login (e.g., Invalid password, Account locked)';
