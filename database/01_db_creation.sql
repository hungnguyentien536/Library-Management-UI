-- =====================================================================
-- db_creation.sql: chỉ tạo bảng cho library_db (MySQL 8.0.16+)
-- =====================================================================
CREATE DATABASE IF NOT EXISTS library_db
    CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE library_db;

-- Xóa bảng con trước, bảng cha sau để chạy lại được
DROP TABLE IF EXISTS fine_payment, fine_due, book_request, book_issue,
                     book_author, members, book,
                     book_request_status, member_status, library_staff,
                     author, location, publisher, category;

-- ---------- Tầng 0: bảng độc lập ----------
CREATE TABLE category (
    category_id   INT AUTO_INCREMENT PRIMARY KEY,
    category_name VARCHAR(100) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE publisher (
    publisher_id   INT AUTO_INCREMENT PRIMARY KEY,
    publisher_name VARCHAR(150) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE location (
    location_id INT AUTO_INCREMENT PRIMARY KEY,
    shelf_no    VARCHAR(20) NOT NULL,
    shelf_name  VARCHAR(100),
    floor_no    TINYINT NOT NULL,
    UNIQUE (shelf_no, floor_no)
) ENGINE=InnoDB;

CREATE TABLE author (
    author_id  INT AUTO_INCREMENT PRIMARY KEY,
    first_name VARCHAR(50) NOT NULL,
    last_name  VARCHAR(50) NOT NULL
) ENGINE=InnoDB;

CREATE TABLE member_status (
    active_status_id INT AUTO_INCREMENT PRIMARY KEY,
    account_type     VARCHAR(50) NOT NULL,
    account_status   VARCHAR(50) NOT NULL,
    UNIQUE (account_type, account_status)
) ENGINE=InnoDB;

CREATE TABLE book_request_status (
    available_status_id INT AUTO_INCREMENT PRIMARY KEY,
    available_status    VARCHAR(50) NOT NULL UNIQUE
) ENGINE=InnoDB;

CREATE TABLE library_staff (
    staff_id          INT AUTO_INCREMENT PRIMARY KEY,
    staff_name        VARCHAR(100) NOT NULL,
    staff_designation VARCHAR(100)
) ENGINE=InnoDB;

-- ---------- Tầng 1 ----------
CREATE TABLE book (
    book_id          INT AUTO_INCREMENT PRIMARY KEY,
    isbn_code        VARCHAR(20) UNIQUE,
    book_title       VARCHAR(255) NOT NULL,
    category_id      INT NOT NULL,
    publisher_id     INT NOT NULL,
    publication_year SMALLINT,
    book_edition     VARCHAR(50),
    book_language    VARCHAR(50),
    publication_type VARCHAR(50),
    copies_total     INT NOT NULL DEFAULT 0,
    copies_available INT NOT NULL DEFAULT 0,
    location_id      INT,
    FOREIGN KEY (category_id)  REFERENCES category(category_id),
    FOREIGN KEY (publisher_id) REFERENCES publisher(publisher_id),
    FOREIGN KEY (location_id)  REFERENCES location(location_id),
    CHECK (copies_total >= 0 AND copies_available BETWEEN 0 AND copies_total),
    CHECK (publication_year IS NULL OR publication_year BETWEEN 1000 AND 2100),
    INDEX idx_book_title (book_title)
) ENGINE=InnoDB;

CREATE TABLE members (
    member_id             INT AUTO_INCREMENT PRIMARY KEY,
    first_name            VARCHAR(50) NOT NULL,
    last_name             VARCHAR(50) NOT NULL,
    city                  VARCHAR(100),
    mobile_no             VARCHAR(20),
    email_id              VARCHAR(100) UNIQUE,
    date_of_birth         DATE,
    active_status_id      INT NOT NULL,
    membership_start_date DATE NOT NULL,
    membership_end_date   DATE,
    FOREIGN KEY (active_status_id) REFERENCES member_status(active_status_id),
    CHECK (membership_end_date IS NULL OR membership_end_date >= membership_start_date)
) ENGINE=InnoDB;

-- ---------- Tầng 2 ----------
CREATE TABLE book_author (
    book_id   INT NOT NULL,
    author_id INT NOT NULL,
    PRIMARY KEY (book_id, author_id),
    FOREIGN KEY (book_id)   REFERENCES book(book_id)     ON DELETE CASCADE,
    FOREIGN KEY (author_id) REFERENCES author(author_id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE book_issue (
    issue_id     INT AUTO_INCREMENT PRIMARY KEY,
    book_id      INT NOT NULL,
    member_id    INT NOT NULL,
    issued_by_id INT NOT NULL,
    issue_date   DATE NOT NULL,
    due_date     DATE NOT NULL,
    return_date  DATE,                      -- NULL = chưa trả
    issue_status ENUM('issued','returned','overdue','lost') NOT NULL DEFAULT 'issued',
    FOREIGN KEY (book_id)      REFERENCES book(book_id),
    FOREIGN KEY (member_id)    REFERENCES members(member_id),
    FOREIGN KEY (issued_by_id) REFERENCES library_staff(staff_id),
    CHECK (due_date >= issue_date),
    CHECK (return_date IS NULL OR return_date >= issue_date),
    INDEX idx_issue_member_return (member_id, return_date),
    INDEX idx_issue_due (due_date)
) ENGINE=InnoDB;

CREATE TABLE book_request (
    request_id             INT AUTO_INCREMENT PRIMARY KEY,
    book_id                INT NOT NULL,
    member_id              INT NOT NULL,
    request_date           DATE NOT NULL DEFAULT (CURRENT_DATE),
    available_status_id    INT NOT NULL,
    nearest_available_date DATE,
    FOREIGN KEY (book_id)             REFERENCES book(book_id),
    FOREIGN KEY (member_id)           REFERENCES members(member_id),
    FOREIGN KEY (available_status_id) REFERENCES book_request_status(available_status_id)
) ENGINE=InnoDB;

-- ---------- Tầng 3 ----------
CREATE TABLE fine_due (
    fine_id    INT AUTO_INCREMENT PRIMARY KEY,
    issue_id   INT NOT NULL UNIQUE,         -- mỗi lượt mượn tối đa 1 khoản phạt
    fine_date  DATE NOT NULL,
    fine_total INT UNSIGNED NOT NULL,       -- VND
    FOREIGN KEY (issue_id) REFERENCES book_issue(issue_id),
    CHECK (fine_total > 0)
) ENGINE=InnoDB;

CREATE TABLE fine_payment (
    fine_payment_id INT AUTO_INCREMENT PRIMARY KEY,
    member_id       INT NOT NULL,
    payment_date    DATE NOT NULL,
    payment_amount  INT UNSIGNED NOT NULL,  -- VND
    FOREIGN KEY (member_id) REFERENCES members(member_id),
    CHECK (payment_amount > 0)
) ENGINE=InnoDB;