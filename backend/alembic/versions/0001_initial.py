"""initial schema

Revision ID: 0001_initial
Revises:
Create Date: 2026-10-02
"""
import sqlalchemy as sa
from alembic import op
from geoalchemy2 import Geometry
from sqlalchemy.dialects import postgresql

revision = "0001_initial"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")
    op.create_table('crop_catalog',
    sa.Column('slug', sa.String(length=60), nullable=False),
    sa.Column('name_en', sa.String(length=120), nullable=False),
    sa.Column('name_ta', sa.String(length=120), nullable=False),
    sa.Column('scientific_name', sa.String(length=160), nullable=False),
    sa.Column('category', sa.String(length=40), nullable=False),
    sa.Column('image_url', sa.String(length=300), nullable=True),
    sa.Column('data', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('confidence', sa.String(length=20), nullable=False),
    sa.Column('model_key', sa.String(length=60), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('slug')
    )
    op.create_table('data_source_metadata',
    sa.Column('key', sa.String(length=60), nullable=False),
    sa.Column('name', sa.String(length=160), nullable=False),
    sa.Column('provider', sa.String(length=120), nullable=False),
    sa.Column('url', sa.String(length=300), nullable=True),
    sa.Column('license', sa.String(length=160), nullable=True),
    sa.Column('attribution', sa.String(length=300), nullable=True),
    sa.Column('coverage', sa.String(length=200), nullable=True),
    sa.Column('resolution', sa.String(length=80), nullable=True),
    sa.Column('update_frequency', sa.String(length=120), nullable=True),
    sa.Column('rate_limit', sa.String(length=200), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('key')
    )
    op.create_table('provider_health',
    sa.Column('provider', sa.String(length=60), nullable=False),
    sa.Column('calls', sa.Integer(), nullable=False),
    sa.Column('errors', sa.Integer(), nullable=False),
    sa.Column('p50_latency_ms', sa.Float(), nullable=True),
    sa.Column('last_success_at', sa.String(length=40), nullable=True),
    sa.Column('last_error_at', sa.String(length=40), nullable=True),
    sa.Column('last_error', sa.Text(), nullable=True),
    sa.Column('circuit_state', sa.String(length=20), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('provider')
    )
    op.create_table('users',
    sa.Column('email', sa.String(length=320), nullable=False),
    sa.Column('password_hash', sa.String(length=255), nullable=False),
    sa.Column('full_name', sa.String(length=200), nullable=False),
    sa.Column('role', sa.String(length=20), nullable=False),
    sa.Column('email_verified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('is_active', sa.Boolean(), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('uq_users_email_active', 'users', ['email'], unique=True, postgresql_where=sa.text('deleted_at IS NULL'))
    op.create_table('audit_logs',
    sa.Column('user_id', sa.UUID(), nullable=True),
    sa.Column('action', sa.String(length=80), nullable=False),
    sa.Column('entity_type', sa.String(length=60), nullable=True),
    sa.Column('entity_id', sa.String(length=64), nullable=True),
    sa.Column('ip', postgresql.INET(), nullable=True),
    sa.Column('details', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audit_logs_action'), 'audit_logs', ['action'], unique=False)
    op.create_index(op.f('ix_audit_logs_created_at'), 'audit_logs', ['created_at'], unique=False)
    op.create_index(op.f('ix_audit_logs_user_id'), 'audit_logs', ['user_id'], unique=False)
    op.create_table('crop_growth_stages',
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('key', sa.String(length=40), nullable=False),
    sa.Column('name_en', sa.String(length=80), nullable=False),
    sa.Column('name_ta', sa.String(length=80), nullable=False),
    sa.Column('order', sa.Integer(), nullable=False),
    sa.Column('description', sa.Text(), nullable=True),
    sa.Column('params', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_catalog.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crop_id', 'key', name='uq_crop_growth_stages_key')
    )
    op.create_index(op.f('ix_crop_growth_stages_crop_id'), 'crop_growth_stages', ['crop_id'], unique=False)
    op.create_table('crop_suitability_rules',
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('region', sa.String(length=20), nullable=False),
    sa.Column('season_key', sa.String(length=30), nullable=False),
    sa.Column('sowing_start', sa.String(length=5), nullable=False),
    sa.Column('sowing_end', sa.String(length=5), nullable=False),
    sa.Column('rule', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('reference', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_catalog.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crop_id', 'region', 'season_key', name='uq_crop_rules')
    )
    op.create_index(op.f('ix_crop_suitability_rules_crop_id'), 'crop_suitability_rules', ['crop_id'], unique=False)
    op.create_table('crop_varieties',
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=80), nullable=False),
    sa.Column('duration_days', sa.Integer(), nullable=False),
    sa.Column('duration_group', sa.String(length=10), nullable=False),
    sa.Column('seasons', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('reference', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_catalog.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('crop_id', 'name', name='uq_crop_varieties_name')
    )
    op.create_index(op.f('ix_crop_varieties_crop_id'), 'crop_varieties', ['crop_id'], unique=False)
    op.create_table('email_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('purpose', sa.String(length=20), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('used_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_email_tokens_user_id'), 'email_tokens', ['user_id'], unique=False)
    op.create_table('land_profiles',
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('name', sa.String(length=120), nullable=False),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('village', sa.String(length=120), nullable=True),
    sa.Column('district', sa.String(length=120), nullable=True),
    sa.Column('state', sa.String(length=120), nullable=True),
    sa.Column('centroid_lat', sa.Float(), nullable=False),
    sa.Column('centroid_lon', sa.Float(), nullable=False),
    sa.Column('terrain', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_land_profiles_owner_id'), 'land_profiles', ['owner_id'], unique=False)
    op.create_table('notifications',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('kind', sa.String(length=40), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('body', sa.Text(), nullable=False),
    sa.Column('link', sa.String(length=300), nullable=True),
    sa.Column('dedupe_key', sa.String(length=200), nullable=False),
    sa.Column('read_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_notifications_user_id'), 'notifications', ['user_id'], unique=False)
    op.create_index('uq_notifications_user_dedupe', 'notifications', ['user_id', 'dedupe_key'], unique=True)
    op.create_table('refresh_tokens',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('token_hash', sa.String(length=64), nullable=False),
    sa.Column('expires_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('user_agent', sa.String(length=300), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('token_hash')
    )
    op.create_index(op.f('ix_refresh_tokens_user_id'), 'refresh_tokens', ['user_id'], unique=False)
    op.create_table('user_preferences',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('language', sa.String(length=8), nullable=False),
    sa.Column('region', sa.String(length=120), nullable=True),
    sa.Column('area_unit', sa.String(length=10), nullable=False),
    sa.Column('timezone', sa.String(length=64), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('user_id')
    )
    op.create_table('crop_cycles',
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('land_id', sa.UUID(), nullable=False),
    sa.Column('crop_id', sa.UUID(), nullable=False),
    sa.Column('variety_id', sa.UUID(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('method', sa.String(length=30), nullable=False),
    sa.Column('anchor_date', sa.Date(), nullable=False),
    sa.Column('anchor_type', sa.String(length=20), nullable=False),
    sa.Column('nursery_sowing_date', sa.Date(), nullable=True),
    sa.Column('irrigation_method', sa.String(length=20), nullable=False),
    sa.Column('water_availability', sa.String(length=20), nullable=False),
    sa.Column('planting_density', sa.String(length=120), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('model_name', sa.String(length=80), nullable=True),
    sa.Column('model_version', sa.String(length=20), nullable=True),
    sa.Column('model_meta', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('harvest_earliest', sa.Date(), nullable=True),
    sa.Column('harvest_expected', sa.Date(), nullable=True),
    sa.Column('harvest_latest', sa.Date(), nullable=True),
    sa.Column('computed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['crop_id'], ['crop_catalog.id'], ),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['variety_id'], ['crop_varieties.id'], ),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_crop_cycles_land_id'), 'crop_cycles', ['land_id'], unique=False)
    op.create_index(op.f('ix_crop_cycles_owner_id'), 'crop_cycles', ['owner_id'], unique=False)
    op.create_index('ix_crop_cycles_owner_status', 'crop_cycles', ['owner_id', 'status'], unique=False)
    op.create_table('environmental_observations',
    sa.Column('land_id', sa.UUID(), nullable=True),
    sa.Column('provider', sa.String(length=60), nullable=False),
    sa.Column('dataset', sa.String(length=120), nullable=False),
    sa.Column('kind', sa.String(length=20), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('start_date', sa.Date(), nullable=False),
    sa.Column('end_date', sa.Date(), nullable=False),
    sa.Column('normalized', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index('ix_env_obs_lookup', 'environmental_observations', ['provider', 'kind', 'lat', 'lon', 'start_date'], unique=False)
    op.create_index(op.f('ix_environmental_observations_land_id'), 'environmental_observations', ['land_id'], unique=False)
    op.create_table('land_boundaries',
    sa.Column('land_id', sa.UUID(), nullable=False),
    sa.Column('version', sa.Integer(), nullable=False),
    sa.Column('is_current', sa.Boolean(), nullable=False),
    sa.Column('geom', Geometry(geometry_type='POLYGON', srid=4326, dimension=2, spatial_index=False, from_text='ST_GeomFromEWKT', name='geometry', nullable=False), nullable=False),
    sa.Column('area_m2', sa.Float(), nullable=False),
    sa.Column('perimeter_m', sa.Float(), nullable=False),
    sa.Column('metrics', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id'),
    sa.UniqueConstraint('land_id', 'version', name='uq_land_boundaries_version')
    )
    op.create_index('ix_land_boundaries_current', 'land_boundaries', ['land_id'], unique=False, postgresql_where=sa.text('is_current'))
    op.create_index('ix_land_boundaries_geom', 'land_boundaries', ['geom'], unique=False, postgresql_using='gist')
    op.create_table('soil_profiles',
    sa.Column('land_id', sa.UUID(), nullable=True),
    sa.Column('provider', sa.String(length=60), nullable=False),
    sa.Column('dataset', sa.String(length=120), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('resolution', sa.String(length=40), nullable=True),
    sa.Column('normalized', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_soil_profiles_land_id'), 'soil_profiles', ['land_id'], unique=False)
    op.create_index('ix_soil_profiles_loc', 'soil_profiles', ['lat', 'lon', 'retrieved_at'], unique=False)
    op.create_table('soil_tests',
    sa.Column('land_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('sample_date', sa.Date(), nullable=False),
    sa.Column('lab_name', sa.String(length=160), nullable=True),
    sa.Column('ph', sa.Float(), nullable=True),
    sa.Column('ec_ds_m', sa.Float(), nullable=True),
    sa.Column('organic_carbon_pct', sa.Float(), nullable=True),
    sa.Column('n_kg_ha', sa.Float(), nullable=True),
    sa.Column('p_kg_ha', sa.Float(), nullable=True),
    sa.Column('k_kg_ha', sa.Float(), nullable=True),
    sa.Column('texture', sa.String(length=60), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_soil_tests_land_id'), 'soil_tests', ['land_id'], unique=False)
    op.create_index(op.f('ix_soil_tests_owner_id'), 'soil_tests', ['owner_id'], unique=False)
    op.create_table('weather_forecasts',
    sa.Column('land_id', sa.UUID(), nullable=True),
    sa.Column('provider', sa.String(length=60), nullable=False),
    sa.Column('lat', sa.Float(), nullable=False),
    sa.Column('lon', sa.Float(), nullable=False),
    sa.Column('retrieved_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('valid_until', sa.DateTime(timezone=True), nullable=False),
    sa.Column('normalized', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('raw', postgresql.JSONB(astext_type=sa.Text()), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_weather_forecasts_land_id'), 'weather_forecasts', ['land_id'], unique=False)
    op.create_index('ix_weather_forecasts_loc', 'weather_forecasts', ['lat', 'lon', 'retrieved_at'], unique=False)
    op.create_table('agricultural_tasks',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('description', sa.Text(), nullable=False),
    sa.Column('category', sa.String(length=30), nullable=False),
    sa.Column('due_date', sa.Date(), nullable=False),
    sa.Column('window_end', sa.Date(), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('weather_sensitive', sa.Boolean(), nullable=False),
    sa.Column('source', sa.String(length=30), nullable=False),
    sa.Column('template_key', sa.String(length=60), nullable=True),
    sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_agricultural_tasks_cycle_id'), 'agricultural_tasks', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_agricultural_tasks_due_date'), 'agricultural_tasks', ['due_date'], unique=False)
    op.create_index(op.f('ix_agricultural_tasks_owner_id'), 'agricultural_tasks', ['owner_id'], unique=False)
    op.create_table('ai_conversations',
    sa.Column('user_id', sa.UUID(), nullable=False),
    sa.Column('land_id', sa.UUID(), nullable=True),
    sa.Column('cycle_id', sa.UUID(), nullable=True),
    sa.Column('title', sa.String(length=200), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['land_id'], ['land_profiles.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_conversations_user_id'), 'ai_conversations', ['user_id'], unique=False)
    op.create_table('crop_photos',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('object_key', sa.String(length=300), nullable=False),
    sa.Column('content_type', sa.String(length=60), nullable=False),
    sa.Column('size_bytes', sa.Integer(), nullable=False),
    sa.Column('caption', sa.Text(), nullable=True),
    sa.Column('taken_on', sa.Date(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_crop_photos_cycle_id'), 'crop_photos', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_crop_photos_owner_id'), 'crop_photos', ['owner_id'], unique=False)
    op.create_table('crop_stage_predictions',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('stage_key', sa.String(length=40), nullable=False),
    sa.Column('order', sa.Integer(), nullable=False),
    sa.Column('start_earliest', sa.Date(), nullable=False),
    sa.Column('start_expected', sa.Date(), nullable=False),
    sa.Column('start_latest', sa.Date(), nullable=False),
    sa.Column('end_earliest', sa.Date(), nullable=False),
    sa.Column('end_expected', sa.Date(), nullable=False),
    sa.Column('end_latest', sa.Date(), nullable=False),
    sa.Column('gdd_start', sa.Float(), nullable=False),
    sa.Column('gdd_end', sa.Float(), nullable=False),
    sa.Column('source', sa.String(length=20), nullable=False),
    sa.Column('observed_on', sa.Date(), nullable=True),
    sa.Column('computed_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_crop_stage_predictions_cycle_id'), 'crop_stage_predictions', ['cycle_id'], unique=False)
    op.create_table('field_observations',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('observed_on', sa.Date(), nullable=False),
    sa.Column('stage_key', sa.String(length=40), nullable=True),
    sa.Column('plant_height_cm', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=False),
    sa.Column('pest_or_disease', sa.String(length=160), nullable=True),
    sa.Column('severity', sa.String(length=10), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_field_observations_cycle_id'), 'field_observations', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_field_observations_owner_id'), 'field_observations', ['owner_id'], unique=False)
    op.create_table('input_applications',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('input_type', sa.String(length=20), nullable=False),
    sa.Column('product', sa.String(length=160), nullable=False),
    sa.Column('quantity', sa.Float(), nullable=True),
    sa.Column('unit', sa.String(length=20), nullable=True),
    sa.Column('cost_inr', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_input_applications_cycle_id'), 'input_applications', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_input_applications_owner_id'), 'input_applications', ['owner_id'], unique=False)
    op.create_table('irrigation_records',
    sa.Column('cycle_id', sa.UUID(), nullable=False),
    sa.Column('owner_id', sa.UUID(), nullable=False),
    sa.Column('date', sa.Date(), nullable=False),
    sa.Column('method', sa.String(length=30), nullable=False),
    sa.Column('duration_hours', sa.Float(), nullable=True),
    sa.Column('water_depth_mm', sa.Float(), nullable=True),
    sa.Column('notes', sa.Text(), nullable=True),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
    sa.ForeignKeyConstraint(['cycle_id'], ['crop_cycles.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['owner_id'], ['users.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_irrigation_records_cycle_id'), 'irrigation_records', ['cycle_id'], unique=False)
    op.create_index(op.f('ix_irrigation_records_owner_id'), 'irrigation_records', ['owner_id'], unique=False)
    op.create_table('ai_messages',
    sa.Column('conversation_id', sa.UUID(), nullable=False),
    sa.Column('role', sa.String(length=12), nullable=False),
    sa.Column('content', sa.Text(), nullable=False),
    sa.Column('sources', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('context', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('suggested_actions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('confirmed_actions', postgresql.JSONB(astext_type=sa.Text()), nullable=False),
    sa.Column('model', sa.String(length=80), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('id', sa.UUID(), nullable=False),
    sa.ForeignKeyConstraint(['conversation_id'], ['ai_conversations.id'], ondelete='CASCADE'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_ai_messages_conversation_id'), 'ai_messages', ['conversation_id'], unique=False)


def downgrade() -> None:
    op.drop_table('ai_messages')
    op.drop_table('irrigation_records')
    op.drop_table('input_applications')
    op.drop_table('field_observations')
    op.drop_table('crop_stage_predictions')
    op.drop_table('crop_photos')
    op.drop_table('ai_conversations')
    op.drop_table('agricultural_tasks')
    op.drop_table('weather_forecasts')
    op.drop_table('soil_tests')
    op.drop_table('soil_profiles')
    op.drop_table('land_boundaries')
    op.drop_table('environmental_observations')
    op.drop_table('crop_cycles')
    op.drop_table('user_preferences')
    op.drop_table('refresh_tokens')
    op.drop_table('notifications')
    op.drop_table('land_profiles')
    op.drop_table('email_tokens')
    op.drop_table('crop_varieties')
    op.drop_table('crop_suitability_rules')
    op.drop_table('crop_growth_stages')
    op.drop_table('audit_logs')
    op.drop_table('users')
    op.drop_table('provider_health')
    op.drop_table('data_source_metadata')
    op.drop_table('crop_catalog')
