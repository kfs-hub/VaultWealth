-- =============================================================================
-- VaultWealth — Subscriptions Table, RLS & Transaction Sync Migration
-- Phase 15: Subscription Tracker
-- =============================================================================

-- 1. Create subscriptions table
CREATE TABLE IF NOT EXISTS public.subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE,
    name TEXT NOT NULL,                                   -- "Netflix", "Spotify", "Gym", etc.
    amount NUMERIC(12, 2) NOT NULL CHECK (amount > 0),
    currency TEXT NOT NULL DEFAULT 'INR',                 -- Base currency: INR
    billing_cycle TEXT NOT NULL CHECK (
        billing_cycle IN ('weekly', 'monthly', 'quarterly', 'yearly', 'custom')
    ),
    custom_cycle_days INTEGER,                            -- Required if billing_cycle = 'custom'
    category TEXT NOT NULL DEFAULT 'Subscriptions',       -- Links to CATEGORIES.expense
    payment_method TEXT DEFAULT 'Credit Card',            -- "Credit Card", "UPI", "Bank Transfer", etc.
    next_billing_date DATE NOT NULL,                      -- Next renewal milestone
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE,                                        -- Optional: cancellation or expiration date
    status TEXT NOT NULL DEFAULT 'active' CHECK (
        status IN ('active', 'paused', 'cancelled', 'expired')
    ),
    description TEXT DEFAULT '',
    auto_create_transaction BOOLEAN DEFAULT true,         -- Auto-generates ledger expense on due date
    reminder_days_before INTEGER DEFAULT 3 CHECK (reminder_days_before >= 0),
    brand_color TEXT DEFAULT '#6366f1',                   -- Accent color for UI badge/card
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Ensure transaction_id column exists if table was already created
ALTER TABLE public.subscriptions 
ADD COLUMN IF NOT EXISTS transaction_id UUID REFERENCES public.transactions(id) ON DELETE CASCADE;

COMMENT ON TABLE public.subscriptions IS 'Stores recurring subscriptions and recurring bill commitments per user.';

-- 2. Performance Indexes
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON public.subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_next_billing ON public.subscriptions(next_billing_date ASC);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON public.subscriptions(status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_status ON public.subscriptions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_subscriptions_transaction_id ON public.subscriptions(transaction_id);

-- 3. Row Level Security (RLS)
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

-- 4. User Notification Preference in profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS subscription_reminders_enabled BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS device_notifications_enabled BOOLEAN DEFAULT true;

-- =============================================================================
-- 5. AUTOMATED TRANSACTION <-> SUBSCRIPTION SYNCHRONIZATION TRIGGER
-- Automatically adds, updates, or removes subscriptions when a transaction has
-- or changes category 'Subscriptions'
-- =============================================================================

CREATE OR REPLACE FUNCTION public.handle_transaction_subscription_sync()
RETURNS TRIGGER AS $$
DECLARE
    v_next_date DATE;
    v_name TEXT;
BEGIN
    -- Case A: Transaction DELETED -> remove linked subscription
    IF (TG_OP = 'DELETE') THEN
        DELETE FROM public.subscriptions WHERE transaction_id = OLD.id;
        RETURN OLD;
    END IF;

    -- Case B: Transaction has category = 'Subscriptions'
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

        -- If subscription already exists for this transaction, update it
        IF EXISTS (SELECT 1 FROM public.subscriptions WHERE transaction_id = NEW.id) THEN
            UPDATE public.subscriptions
            SET name = v_name,
                amount = NEW.amount,
                category = 'Subscriptions',
                updated_at = timezone('utc'::text, now())
            WHERE transaction_id = NEW.id;
        ELSE
            -- Otherwise insert new subscription
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

    -- Case C: Category was changed AWAY from 'Subscriptions' -> delete linked subscription
    ELSE
        IF (TG_OP = 'UPDATE' AND LOWER(TRIM(OLD.category)) = 'subscriptions') THEN
            DELETE FROM public.subscriptions WHERE transaction_id = NEW.id;
        END IF;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Drop and re-create trigger
DROP TRIGGER IF EXISTS on_transaction_subscription_sync ON public.transactions;
CREATE TRIGGER on_transaction_subscription_sync
    AFTER INSERT OR UPDATE OR DELETE ON public.transactions
    FOR EACH ROW EXECUTE FUNCTION public.handle_transaction_subscription_sync();
