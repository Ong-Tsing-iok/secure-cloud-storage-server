CREATE TABLE secret_share (
    userid TEXT NOT NULL PRIMARY KEY,
    share TEXT NOT NULL,
    retrievable BOOLEAN NOT NULL
);