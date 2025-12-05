-- D1 Schema for LatticeLink
DROP TABLE IF EXISTS tags;
DROP TABLE IF EXISTS links;
CREATE TABLE links (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL UNIQUE,
    title TEXT,
    description TEXT,
    h1 TEXT,
    mime TEXT,
    byteSize INTEGER,
    lastModified TEXT,
    ingestedAt TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE tags (
    linkId TEXT NOT NULL,
    tag TEXT NOT NULL,
    PRIMARY KEY (linkId, tag),
    FOREIGN KEY (linkId) REFERENCES links(id) ON DELETE CASCADE
);
CREATE INDEX idx_tags_tag ON tags(tag);