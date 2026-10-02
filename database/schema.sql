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
