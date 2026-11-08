"""Assemble the additive continuous Discover upgrade; never rewrite the v1 migration."""
from pathlib import Path
parts=['continuous-schema.sql','continuous-pool.sql','continuous-functions.sql']
text='-- Noted continuous Discover. Run continuous_discover_preflight.sql first.\n-- Requires the original Discover migration; preserves old tables, rows and review progress.\n'
text+='\n'.join((Path('scripts/discover-sql')/part).read_text() for part in parts)
Path('supabase/migrations/20261108_continuous_discover.sql').write_text(text)
