-- =============================================================================
-- VaultWealth — PostgreSQL Database Schema & Security Definition
-- Phase 4: Supabase Database & Row Level Security (RLS)
-- =============================================================================

-- 1. Enable UUID Extension (Available by default in Supabase PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- 2. TABLE: profiles
-- Stores public profile information linked 1:1 with Supabase auth.users
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    email TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Comment on table and columns for documentation
COMMENT ON TABLE public.profiles IS 'Stores user profile details corresponding to authenticated Supabase accounts.';
COMMENT ON COLUMN public.profiles.id IS 'Primary key referencing auth.users.id';

-- =============================================================================
-- 3. TABLE: transactions
-- Primary financial ledger table for income and expenses
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('income', 'expense')),
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    category TEXT NOT NULL,
    description TEXT DEFAULT '' NOT NULL,
    transaction_date DATE NOT NULL DEFAULT CURRENT_DATE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

COMMENT ON TABLE public.transactions IS 'Stores all income and expense records per user.';
COMMENT ON COLUMN public.transactions.amount IS 'Monetary amount strictly greater than zero.';
COMMENT ON COLUMN public.transactions.type IS 'Must be either "income" or "expense".';

-- =============================================================================
-- 4. PERFORMANCE INDEXES
-- Accelerate common queries: filtering by user, date range, type, and category
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_transactions_user_id ON public.transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_transactions_date ON public.transactions(transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON public.transactions(user_id, transaction_date DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_category ON public.transactions(category);

-- =============================================================================
-- 5. AUTOMATED USER PROFILE CREATION (DATABASE TRIGGER)
-- Automatically inserts a row into public.profiles whenever a user registers in auth.users
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'full_name', 'Vault User'),
        NEW.email
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger definition on auth.users table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =============================================================================
-- 6. ROW LEVEL SECURITY (RLS) POLICIES
-- Strict multi-tenant isolation: User A cannot see, edit, or delete User B's records
-- =============================================================================

-- Enable RLS on both tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;

-- -----------------------------------------------------------------------------
-- 6.1 Policies for `profiles` table
-- -----------------------------------------------------------------------------
-- Users can read their own profile
CREATE POLICY "Users can view their own profile"
    ON public.profiles
    FOR SELECT
    USING (auth.uid() = id);

-- Users can update their own profile
CREATE POLICY "Users can update their own profile"
    ON public.profiles
    FOR UPDATE
    USING (auth.uid() = id);

-- -----------------------------------------------------------------------------
-- 6.2 Policies for `transactions` table (Full CRUD Isolation)
-- -----------------------------------------------------------------------------
-- SELECT: Users can only query their own transactions
CREATE POLICY "Users can view their own transactions"
    ON public.transactions
    FOR SELECT
    USING (auth.uid() = user_id);

-- INSERT: Users can only create transactions where user_id matches their auth ID
CREATE POLICY "Users can insert their own transactions"
    ON public.transactions
    FOR INSERT
    WITH CHECK (auth.uid() = user_id);

-- UPDATE: Users can only update their own transactions
CREATE POLICY "Users can update their own transactions"
    ON public.transactions
    FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- DELETE: Users can only delete their own transactions
CREATE POLICY "Users can delete their own transactions"
    ON public.transactions
    FOR DELETE
    USING (auth.uid() = user_id);

-- =============================================================================
-- 7. TABLE: subscriptions
-- Stores recurring subscriptions and recurring bill commitments per user
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',
    billing_cycle TEXT NOT NULL CHECK (
        billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')
    ),
    custom_cycle_days INTEGER,
    category TEXT NOT NULL DEFAULT 'Subscriptions',
    payment_method TEXT DEFAULT 'Credit Card',
    next_billing_date DATE NOT NULL,
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'paused', 'cancelled', 'expired')
    ),
    description TEXT DEFAULT '',
    auto_create_transaction BOOLEAN DEFAULT true,
    reminder_days_before INTEGER DEFAULT 3 CHECK (reminder_days_before >= 0),
    brand_color TEXT DEFAULT '#6366f1',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON public.subscriptions(next_billing_date ASC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_transaction_id ON public.subscriptions(transaction_id);

ALTER TABLE public.subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own subscriptions"
    ON public.subscriptions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own subscriptions"
    ON public.subscriptions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own subscriptions"
    ON public.subscriptions FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own subscriptions"
    ON public.subscriptions FOR DELETE
    USING (auth.uid() = user_id);

ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_reminders_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS device_notifications_enabled BOOLEAN DEFAULT true;

-- =============================================================================
-- 8. TRANSACTION <-> SUBSCRIPTION SYNCHRONIZATION TRIGGER
-- Automatically syncs transactions with category = 'Subscriptions'
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_transaction_subscription_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_next_date DATE;
    v_name TEXT;
BEGIN
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.subscriptions WHERE transaction_id = OLD.id;
        RETURN OLD;
    END IF;

    IF (LOWER(TRIM(NEW.category)) = 'subscriptions') THEN
        -- Guard: Ignore renewal transactions to prevent recursive duplicate subscription generation
        IF (NEW.description ILIKE '%(Recurring renewal)%' OR NEW.description ILIKE '%renewal%') THEN
            RETURN NEW;
        END IF;

        v_next_date := (NEW.transaction_date + INTERVAL '1 month')::DATE;
        IF v_next_date <= CURRENT_DATE THEN
            v_next_date := (CURRENT_DATE + INTERVAL '1 month')::DATE;
        END IF;

        v_name := COALESCE(NULLIF(TRIM(NEW.description), ''), 'Subscription Expense');

        IF EXISTS (SELECT 1 FROM public.subscriptions WHERE transaction_id = NEW.id) THEN
            UPDATE public.subscriptions
            SET name = v_name,
                amount = NEW.amount,
                category = 'Subscriptions',
                updated_at = timezone('utc'::text, now())
            WHERE transaction_id = NEW.id;
        ELSE
            INSERT INTO public.subscriptions (
                user_id,
                transaction_id,
                name,
                amount,
                currency,
                billing_cycle,
                category,
                payment_method,
                next_billing_date,
                start_date,
                status,
                auto_create_transaction,
                reminder_days_before,
                description
            ) VALUES (
                NEW.user_id,
                NEW.id,
                v_name,
                NEW.amount,
                'INR',
                'monthly',
                'Subscriptions',
                'Credit Card',
                v_next_date,
                NEW.transaction_date,
                'active',
                false,
                3,
                COALESCE(NEW.description, '')
            );
        END IF;
    ELSE
        IF (TG_OP = 'UPDATE' AND LOWER(TRIM(OLD.category)) = 'subscriptions') THEN
            DELETE FROM public.subscriptions WHERE transaction_id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_transaction_subscription_sync ON public.transactions;
CREATE TRIGGER on_transaction_subscription_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.handle_transaction_subscription_sync();


