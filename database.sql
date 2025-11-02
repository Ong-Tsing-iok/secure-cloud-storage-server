CREATE TABLE users (
    id TEXT PRIMARY KEY NOT NULL,
    pk TEXT NOT NULL,
    address TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    status TEXT NOT NULL,
    timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE TABLE folders (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    permissions INTEGER NOT NULL,
    parentFolderId TEXT,
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(parentFolderId) REFERENCES folders(id) ON DELETE SET NULL
);
CREATE TABLE files (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    ownerId TEXT NOT NULL,
    originOwnerId TEXT,
    permissions INTEGER NOT NULL,
    cipher TEXT,
    spk TEXT,
    parentFolderId TEXT,
    size INTEGER,
    description TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(ownerId) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY(originOwnerId) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY(parentFolderId) REFERENCES folders(id) ON DELETE SET NULL
);
CREATE TABLE requests (
    id TEXT PRIMARY KEY NOT NULL,
    fileId TEXT NOT NULL,
    requester TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(fileId) REFERENCES files(id) ON DELETE CASCADE,
    FOREIGN KEY(requester) REFERENCES users(id) ON DELETE CASCADE
);
CREATE TABLE responses (
    id TEXT PRIMARY KEY NOT NULL,
    requestId TEXT NOT NULL,
    agreed BOOLEAN NOT NULL, 
    description TEXT NOT NULL DEFAULT '',
    timestamp TIMESTAMPTZ DEFAULT NOW(),
    FOREIGN KEY(requestId) REFERENCES requests(id) ON DELETE CASCADE
);
CREATE TABLE ctw_table (
    fileid TEXT not null,
    j INTEGER not null,
    ctw TEXT not null,
    PRIMARY KEY (fileid, j),
    FOREIGN KEY (fileid) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE ct_table (
    fileid TEXT not null,
    i INTEGER not null,
    ct TEXT not null,
    PRIMARY KEY (fileid, i),
    FOREIGN KEY (fileid) REFERENCES files(id) ON DELETE CASCADE
);

CREATE TABLE ctstar_table (
    fileid TEXT PRIMARY KEY not null,
    ctstar TEXT not null,
    FOREIGN KEY (fileid) REFERENCES files(id) ON DELETE CASCADE
);