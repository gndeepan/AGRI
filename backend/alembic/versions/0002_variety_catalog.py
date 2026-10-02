"""Variety catalog: provenance, verification, extra attributes and farmer-owned varieties.

Revision ID: 0002_variety_catalog
Revises: 0001_initial
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0002_variety_catalog"
down_revision = "0001_initial"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("crop_varieties", sa.Column("owner_id", sa.UUID(), nullable=True))
    op.add_column("crop_varieties", sa.Column("source", sa.String(length=20), nullable=False,
                                              server_default="catalog"))
    op.add_column("crop_varieties", sa.Column("verified", sa.Boolean(), nullable=False, server_default=sa.true()))
    op.add_column("crop_varieties", sa.Column("data", postgresql.JSONB(astext_type=sa.Text()), nullable=False,
                                              server_default=sa.text("'{}'::jsonb")))
    op.create_foreign_key("fk_crop_varieties_owner_id_users", "crop_varieties", "users", ["owner_id"], ["id"],
                          ondelete="CASCADE")
    op.create_index("ix_crop_varieties_owner_id", "crop_varieties", ["owner_id"])
    op.drop_constraint("uq_crop_varieties_name", "crop_varieties", type_="unique")
    op.create_index("uq_crop_varieties_catalog_name", "crop_varieties", ["crop_id", "name"], unique=True,
                    postgresql_where=sa.text("owner_id IS NULL"))
    op.create_index("uq_crop_varieties_owner_name", "crop_varieties", ["crop_id", "owner_id", "name"], unique=True,
                    postgresql_where=sa.text("owner_id IS NOT NULL"))


def downgrade() -> None:
    op.execute("DELETE FROM crop_varieties WHERE owner_id IS NOT NULL")
    op.drop_index("uq_crop_varieties_owner_name", table_name="crop_varieties")
    op.drop_index("uq_crop_varieties_catalog_name", table_name="crop_varieties")
    op.create_unique_constraint("uq_crop_varieties_name", "crop_varieties", ["crop_id", "name"])
    op.drop_index("ix_crop_varieties_owner_id", table_name="crop_varieties")
    op.drop_constraint("fk_crop_varieties_owner_id_users", "crop_varieties", type_="foreignkey")
    op.drop_column("crop_varieties", "data")
    op.drop_column("crop_varieties", "verified")
    op.drop_column("crop_varieties", "source")
    op.drop_column("crop_varieties", "owner_id")
