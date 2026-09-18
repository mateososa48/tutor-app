-- Durable tutoring evidence and learner projections.
-- Apply once before enabling the learning endpoint in a deployed environment.

CREATE TABLE IF NOT EXISTS skills (
  key text PRIMARY KEY,
  label text NOT NULL,
  domain text NOT NULL,
  grade_band text NOT NULL,
  aliases jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamp NOT NULL DEFAULT now()
);

INSERT INTO skills (key, label, domain, grade_band, aliases) VALUES
  ('arithmetic.add', 'Addition', 'arithmetic', '2-6', '["adding whole numbers","whole number addition"]'),
  ('arithmetic.subtract', 'Subtraction', 'arithmetic', '2-6', '["subtracting whole numbers","whole number subtraction"]'),
  ('arithmetic.multiply', 'Multiplication', 'arithmetic', '3-7', '["multiplying whole numbers","times tables"]'),
  ('arithmetic.divide', 'Division', 'arithmetic', '3-7', '["dividing whole numbers","long division"]'),
  ('fractions.identify', 'Understanding fractions', 'fractions', '3-6', '["identify fractions","fraction meaning"]'),
  ('fractions.equivalent', 'Equivalent fractions', 'fractions', '3-7', '["finding equivalent fractions","simplifying fractions"]'),
  ('fractions.compare', 'Comparing fractions', 'fractions', '3-7', '["order fractions","ordering fractions"]'),
  ('fractions.add-like', 'Adding fractions with like denominators', 'fractions', '4-7', '["add fractions same denominator","adding fractions same denominator"]'),
  ('fractions.add-unlike', 'Adding fractions with unlike denominators', 'fractions', '5-8', '["add fractions different denominators","add fractions unlike denominators"]'),
  ('fractions.subtract', 'Subtracting fractions', 'fractions', '4-8', '["subtract fractions","fraction subtraction"]'),
  ('fractions.multiply', 'Multiplying fractions', 'fractions', '5-8', '["multiply fractions","fraction multiplication"]'),
  ('fractions.divide', 'Dividing fractions', 'fractions', '5-8', '["divide fractions","fraction division"]'),
  ('fractions.mixed-numbers', 'Mixed numbers', 'fractions', '4-8', '["improper fractions and mixed numbers","convert mixed numbers"]'),
  ('decimals.operations', 'Decimal operations', 'decimals', '4-8', '["operations with decimals","decimal arithmetic"]'),
  ('percent.of', 'Percent of an amount', 'percent', '5-9', '["find a percent of a number","percent of a number"]'),
  ('percent.change', 'Percent change', 'percent', '6-10', '["percent increase and decrease","percentage change"]'),
  ('ratios.proportions', 'Ratios and proportions', 'ratios', '5-9', '["solve proportions","proportional relationships"]'),
  ('integers.operations', 'Integer operations', 'integers', '6-9', '["operations with negative numbers","negative number operations"]'),
  ('algebra.evaluate', 'Evaluating expressions', 'algebra', '6-9', '["evaluate an expression","substitution in expressions"]'),
  ('algebra.combine-like-terms', 'Combining like terms', 'algebra', '6-10', '["combine like terms","collect like terms"]'),
  ('algebra.distribute', 'The distributive property', 'algebra', '6-10', '["distributing expressions","distributive property"]'),
  ('algebra.simplify', 'Simplifying expressions', 'algebra', '6-10', '["simplify algebraic expressions","expression simplification"]'),
  ('equations.one-step', 'One-step equations', 'equations', '6-9', '["solving one step equations","one step equation"]'),
  ('equations.two-step', 'Two-step equations', 'equations', '7-10', '["solving two step equations","two step equations"]'),
  ('equations.variables-both-sides', 'Equations with variables on both sides', 'equations', '8-11', '["variables on both sides","multi step equations"]'),
  ('equations.quadratic-solutions', 'Solving quadratic equations', 'equations', '9-12', '["quadratic solutions","solve quadratics"]'),
  ('graphs.slope', 'Slope', 'graphs', '7-11', '["finding slope","rate of change"]'),
  ('graphs.intercepts', 'Intercepts', 'graphs', '7-11', '["x intercept","y intercept","finding intercepts"]'),
  ('graphs.linear-equations', 'Graphing linear equations', 'graphs', '7-11', '["linear graphs","slope intercept form"]'),
  ('graphs.systems', 'Systems of linear equations', 'graphs', '8-12', '["solving systems","systems of equations"]')
ON CONFLICT (key) DO UPDATE SET
  label = EXCLUDED.label,
  domain = EXCLUDED.domain,
  grade_band = EXCLUDED.grade_band,
  aliases = EXCLUDED.aliases;

CREATE TABLE IF NOT EXISTS teaching_moves (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id text,
  skill_key text REFERENCES skills(key) ON DELETE SET NULL,
  raw_skill text NOT NULL,
  help_level integer NOT NULL CHECK (help_level BETWEEN 0 AND 5),
  move text NOT NULL,
  diagnosis text,
  strategy text,
  intent text,
  occurred_at bigint NOT NULL,
  cancelled_at bigint,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS teaching_moves_user_skill_time_idx ON teaching_moves(user_id, skill_key, occurred_at);
CREATE INDEX IF NOT EXISTS teaching_moves_session_call_idx ON teaching_moves(session_id, call_id);

CREATE TABLE IF NOT EXISTS learning_attempts (
  id text PRIMARY KEY,
  session_id text NOT NULL REFERENCES tutor_sessions(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  call_id text,
  skill_key text REFERENCES skills(key) ON DELETE SET NULL,
  raw_skill text NOT NULL,
  problem text NOT NULL,
  problem_fingerprint text NOT NULL,
  student_answer text NOT NULL,
  result text NOT NULL,
  help_level integer NOT NULL CHECK (help_level BETWEEN 0 AND 5),
  occurred_at bigint NOT NULL,
  cancelled_at bigint,
  created_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS learning_attempts_user_skill_time_idx ON learning_attempts(user_id, skill_key, occurred_at);
CREATE INDEX IF NOT EXISTS learning_attempts_session_time_idx ON learning_attempts(session_id, occurred_at);
CREATE INDEX IF NOT EXISTS learning_attempts_session_call_idx ON learning_attempts(session_id, call_id);

CREATE TABLE IF NOT EXISTS learner_skill_states (
  user_id text NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  skill_key text NOT NULL REFERENCES skills(key) ON DELETE CASCADE,
  status text NOT NULL,
  attempt_count integer NOT NULL,
  correct_count integer NOT NULL,
  independent_correct_count integer NOT NULL,
  distinct_independent_problem_count integer NOT NULL,
  latest_attempt_at bigint NOT NULL,
  last_correct_at bigint,
  last_independent_at bigint,
  retained_at bigint,
  effective_help_level integer,
  evidence_note text NOT NULL,
  updated_at timestamp NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, skill_key)
);

CREATE INDEX IF NOT EXISTS learner_skill_states_user_status_idx ON learner_skill_states(user_id, status);

