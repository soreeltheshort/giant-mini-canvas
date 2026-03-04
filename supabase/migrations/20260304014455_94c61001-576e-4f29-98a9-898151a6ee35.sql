
-- Create app_role enum
CREATE TYPE public.app_role AS ENUM ('admin', 'user');

-- User roles table
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL DEFAULT 'user',
  UNIQUE (user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

-- Security definer function for role checks
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role
  )
$$;

CREATE POLICY "Users can read own roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id);

-- Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  display_name TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON public.profiles FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Auto-create profile and role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (user_id, display_name) VALUES (NEW.id, NEW.raw_user_meta_data->>'display_name');
  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'user');
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Ship types catalog
CREATE TABLE public.ship_types (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  class TEXT NOT NULL CHECK (class IN ('General', 'Assault', 'Escort')),
  hull_class TEXT NOT NULL CHECK (hull_class IN ('Light', 'Medium', 'Heavy', 'Capital')),
  point_cost INTEGER NOT NULL,
  hull INTEGER NOT NULL,
  armor INTEGER NOT NULL DEFAULT 0,
  lasers INTEGER NOT NULL DEFAULT 0,
  missiles INTEGER NOT NULL DEFAULT 0,
  sensor_rating INTEGER NOT NULL DEFAULT 0,
  max_jump INTEGER NOT NULL DEFAULT 1,
  supply_capacity INTEGER NOT NULL DEFAULT 0
);
ALTER TABLE public.ship_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Ship types are public" ON public.ship_types FOR SELECT USING (true);

-- Fleets
CREATE TABLE public.fleets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  revision INTEGER NOT NULL DEFAULT 1,
  points_budget INTEGER NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.fleets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all fleets" ON public.fleets FOR SELECT USING (true);
CREATE POLICY "Users can insert own fleets" ON public.fleets FOR INSERT WITH CHECK (auth.uid() = owner_user_id);
CREATE POLICY "Users can update own fleets" ON public.fleets FOR UPDATE USING (auth.uid() = owner_user_id);
CREATE POLICY "Users can delete own fleets" ON public.fleets FOR DELETE USING (auth.uid() = owner_user_id);

-- Fleet ships
CREATE TABLE public.fleet_ships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_id UUID REFERENCES public.fleets(id) ON DELETE CASCADE NOT NULL,
  ship_type_id UUID REFERENCES public.ship_types(id) NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 1,
  tactical_group TEXT NOT NULL DEFAULT 'Core' CHECK (tactical_group IN ('Core', 'Rear', 'Retreat', 'Special1', 'Special2')),
  notes TEXT
);
ALTER TABLE public.fleet_ships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all fleet ships" ON public.fleet_ships FOR SELECT USING (true);
CREATE POLICY "Users can insert own fleet ships" ON public.fleet_ships FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.fleets WHERE id = fleet_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Users can update own fleet ships" ON public.fleet_ships FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.fleets WHERE id = fleet_id AND owner_user_id = auth.uid())
);
CREATE POLICY "Users can delete own fleet ships" ON public.fleet_ships FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.fleets WHERE id = fleet_id AND owner_user_id = auth.uid())
);

-- Battle runs
CREATE TABLE public.battle_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fleet_a_snapshot_json JSONB NOT NULL,
  fleet_b_snapshot_json JSONB NOT NULL,
  seed TEXT NOT NULL,
  result_json JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL
);
ALTER TABLE public.battle_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Battle runs are public" ON public.battle_runs FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create battles" ON public.battle_runs FOR INSERT WITH CHECK (auth.uid() = created_by_user_id);

-- Battle events
CREATE TABLE public.battle_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  battle_run_id UUID REFERENCES public.battle_runs(id) ON DELETE CASCADE NOT NULL,
  seq INTEGER NOT NULL,
  tick INTEGER NOT NULL DEFAULT 0,
  event_type TEXT NOT NULL,
  payload_json JSONB NOT NULL DEFAULT '{}',
  public_summary_text TEXT NOT NULL DEFAULT '',
  admin_explain_text TEXT NOT NULL DEFAULT ''
);
ALTER TABLE public.battle_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Battle events are public" ON public.battle_events FOR SELECT USING (true);
CREATE POLICY "Authenticated users can create events" ON public.battle_events FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.battle_runs WHERE id = battle_run_id AND created_by_user_id = auth.uid())
);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_fleets_updated_at BEFORE UPDATE ON public.fleets FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed ship types catalog (8 ships across classes)
INSERT INTO public.ship_types (name, class, hull_class, point_cost, hull, armor, lasers, missiles, sensor_rating, max_jump, supply_capacity) VALUES
  ('Scout Frigate', 'Escort', 'Light', 5, 20, 2, 3, 0, 8, 4, 0),
  ('Missile Corvette', 'Escort', 'Light', 7, 25, 3, 1, 6, 6, 3, 0),
  ('Destroyer', 'General', 'Medium', 12, 50, 8, 8, 4, 5, 2, 5),
  ('Light Cruiser', 'General', 'Medium', 18, 80, 12, 12, 6, 5, 2, 10),
  ('Heavy Cruiser', 'Assault', 'Heavy', 25, 120, 18, 15, 10, 4, 2, 15),
  ('Battlecruiser', 'Assault', 'Heavy', 30, 150, 22, 20, 12, 3, 1, 20),
  ('Dreadnought', 'Assault', 'Capital', 40, 250, 35, 30, 18, 2, 1, 30),
  ('Carrier', 'General', 'Capital', 35, 200, 25, 10, 8, 6, 1, 50);
