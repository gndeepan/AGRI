-- Separate database for the pytest suite.
CREATE DATABASE bhoomi_test OWNER bhoomi;
\connect bhoomi_test
CREATE EXTENSION IF NOT EXISTS postgis;
\connect bhoomi
CREATE EXTENSION IF NOT EXISTS postgis;
