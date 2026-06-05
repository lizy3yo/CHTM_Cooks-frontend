# CHTM Cooks - Laboratory Equipment Management System

A comprehensive laboratory equipment management system for the College of Hospitality & Tourism Management (CHTM) at Gordon College. Built with SvelteKit, featuring role-based authentication, equipment reservation workflows, QR code verification, and real-time inventory tracking.

## Overview

CHTM Cooks streamlines the equipment borrowing process for students, instructors, and laboratory custodians. The system provides a centralized platform for browsing available equipment, submitting reservation requests, obtaining instructor approvals, and tracking equipment returns through QR code verification.

## Features

### Core Functionality
- **Equipment Catalog**: Real-time inventory browsing with availability status and category filtering
- **Reservation System**: Student-initiated equipment borrowing requests with scheduling
- **Instructor Approval**: Class instructor verification for all requests before processing
- **QR Code Verification**: Contactless equipment pickup and return via QR scanning
- **Trust Score System**: Student accountability tracking based on borrowing history and timeliness
- **Offline Support**: Local database synchronization for network resilience with Dexie IndexedDB
- **Replacement Management**: Damage and loss tracking with financial obligation tracking
- **Audit Logging**: Comprehensive system activity logging for accountability
- **Class Code Management**: Instructor-student class assignment and organization
- **Database Management**: Direct database access and maintenance tools for superadmins

### Student Features
- **Catalog Browsing**: Search and filter available equipment by category
- **Request Submission**: Add items to cart and submit borrowing requests
- **Request Tracking**: Monitor approval status and preparation progress
- **Borrowed Items**: View currently borrowed equipment and return deadlines
- **Request History**: Complete history of all borrowing requests
- **QR Code Generation**: Personal QR code for equipment pickup and return
- **Account Management**: Profile settings, notifications, and help center
- **Support**: AI-powered virtual help desk assistance

### Instructor Features
- **Request Approval**: Review and approve student borrowing requests
- **Class Statistics**: View borrowing statistics by class section
- **Inventory Overview**: Monitor equipment availability and usage
- **Request History**: Track all requests from assigned classes
- **Reports**: Generate and export borrowing reports
- **Messages**: Communication with students and staff
- **Account Management**: Profile settings and notifications

### Custodian Features
- **Request Processing**: Prepare equipment for approved requests
- **QR Scanning**: Verify student QR codes for pickup and return
- **Inventory Management**: Update equipment status and availability
- **Replacement Tracking**: Record damage, loss, and replacement obligations
- **Request History**: Track all processed requests
- **Reports**: Generate inventory and activity reports
- **Notifications**: Receive system alerts and updates

### Superadmin Features
- **User Management**: Create, edit, and delete user accounts
- **Analytics Dashboard**: Comprehensive system statistics and metrics
- **Audit Logs**: View all system activities and changes
- **Class Code Management**: Manage class codes and assignments
- **Database Management**: Direct database access and maintenance
- **Inventory Management**: Full inventory control and configuration
- **System Settings**: Configure system-wide parameters

### Authentication & Authorization
- **Student Registration**: Self-service registration with institutional email verification
- **Staff Authentication**: Shortcut key access for instructors and custodians
- **Email Verification**: Secure confirmation with expiring tokens
- **Password Reset**: Secure password recovery workflow
- **JWT Authentication**: Access and refresh token-based security
- **Role-Based Access Control**: Granular permissions by user role
- **Session Management**: Secure token handling and refresh

### Security Features
- **Password Hashing**: bcrypt with salt rounds
- **JWT Authentication**: Secure token-based auth
- **Role-Based Access Control (RBAC)**: Fine-grained permissions
- **Input Validation**: Comprehensive server-side validation
- **Rate Limiting**: Redis-based request throttling
- **Security Headers**: CSP, HSTS, and additional hardening
- **Audit Logging**: Complete activity tracking for security monitoring

### Additional Features
- **PWA Support**: Progressive Web App capabilities for offline access
- **Excel Export**: Export reports and data to Excel format
- **Cloudinary Integration**: Cloud-based image storage
- **Lottie Animations**: Rich animated UI elements
- **Real-time Updates**: Live notification system
- **Responsive Design**: Mobile-first responsive layout
- **Accessibility**: WCAG-compliant accessibility features


## Tech Stack

### Frontend
- **SvelteKit 2.x**: Full-stack framework with server-side rendering
- **Svelte 5**: Modern reactive UI with runes
- **TypeScript**: Type-safe development
- **Tailwind CSS 4.x**: Utility-first styling
- **Lucide Svelte**: Icon library
- **Tabler Icons**: Additional icon set
- **Lottie Web**: Rich animated UI elements
- **DotLottie**: Optimized Lottie format for Svelte

### Backend
- **SvelteKit API Routes**: RESTful endpoints
- **MongoDB**: Document database for data persistence
- **Mongoose**: MongoDB object modeling
- **Redis**: Caching and rate limiting (ioredis, Upstash Redis)
- **JWT**: Token-based authentication
- **bcryptjs**: Password hashing
- **Nodemailer**: Email service integration

### Database & Storage
- **MongoDB**: Primary data storage
- **IndexedDB (Dexie)**: Client-side offline storage
- **Dexie Export/Import**: Database backup and restore
- **Cloudinary**: Cloud-based image storage

### QR Code & Scanning
- **QR Code**: QR code generation library
- **ZXing Browser**: Barcode scanning in browser
- **ZXing Library**: Core barcode processing
- **HTML5 QR Code**: Alternative QR scanning solution
- **JSQR**: QR code reading library

### AI & Analytics
- **Google GenAI**: AI integration for virtual help desk
- **Bytez.js**: AI chat orchestration

### Utilities
- **ExcelJS**: Excel file generation
- **XLSX**: Excel file processing
- **JSZip**: ZIP file creation and manipulation
- **UUID**: Unique identifier generation
- **Winston**: Logging framework
- **Winston Daily Rotate File**: Log rotation

### PWA & Offline
- **Vite PWA**: Progressive Web App plugin
- **Workbox Window**: Service worker management

### Development Tools
- **ESLint**: Code linting
- **Prettier**: Code formatting
- **Svelte Check**: Svelte type checking
- **Vite**: Build tool and dev server
- **Sharp**: Image processing

## Installation

### Prerequisites
- Node.js 18 or higher
- MongoDB (local instance or MongoDB Atlas)
- Redis (optional, recommended for production rate limiting)

### Setup Instructions

1. Clone the repository
```sh
git clone <repository-url>
cd chtm_cooks
```

2. Install dependencies
```sh
npm install
```

3. Configure environment variables

Create a `.env` file in the root directory (or copy from `.env.example`):
```env
# Database Configuration
MONGODB_URI=mongodb://localhost:27017/chtm_cooks

# JWT Secrets
JWT_ACCESS_SECRET=your-access-secret-here
JWT_REFRESH_SECRET=your-refresh-secret-here

# Email Configuration
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-email-password

# Application URLs
APP_URL=http://localhost:5173
PUBLIC_BASE_URL=http://localhost:5173

# AI Chat Integration
BYTEZ_API_KEY=your-bytez-api-key

# Redis Configuration (optional)
REDIS_URL=redis://localhost:6379
```

4. Start the development server
```sh
npm run dev
```

The application will be available at `http://localhost:5173`

## Testing

### Postman Collection

1. Import the collection
   - Open Postman
   - Import `POSTMAN_COLLECTION.json`
   - Set `baseUrl` variable to `http://localhost:5173`

2. Test authentication flow
   - Register a student account
   - Login to obtain access token
   - Test protected endpoints with token

3. Test user management (requires superadmin)
   - Login as superadmin
   - Create users (instructors, custodians, superadmins)
   - Test user CRUD operations
   - Verify search and filter functionality

For detailed testing instructions, refer to [DASHBOARD_TESTING.md](./DASHBOARD_TESTING.md)

### Manual Testing

See [TESTING_GUIDE.md](./TESTING_GUIDE.md) for comprehensive manual testing scenarios.

## Demo Data Workflow

Use these scripts to prepare a presentation-ready dataset across major collections and switch between populated and empty states safely.

### Seed Script Adds
- 20 users with realistic names and Gordon College email addresses
- Borrow requests
- Replacement obligations
- Donations
- Notifications
- Shortcut keys
- Remember tokens

### Seed Script Excludes
- Inventory items (intentionally excluded for separate management)

### Commands

```sh
# Preview only (dry-run)
npm run db:seed-demo-analytics

# Execute seed
npm run db:seed-demo-analytics:yes

# Preview purge only (dry-run)
npm run db:purge-demo-analytics

# Purge seeded demo data (keeps seeded users)
npm run db:purge-demo-analytics:yes

# Purge seeded demo data but keep users
npm run db:purge-demo-analytics:yes:keep-users
```

### Operational Notes
- Both scripts default to dry-run for safety
- Seeded records are tagged and purged by tag only to avoid deleting non-demo data
- Existing users with matching emails are updated (upsert) rather than duplicated
- Full purge (`db:purge-demo-analytics:yes`) includes seeded users for true empty-state demos

## Initial Setup

### Create First Superadmin

If starting with a fresh database, create a superadmin account via MongoDB:

```javascript
// Connect to MongoDB
mongosh
use chtm_cooks

// Create superadmin (replace password hash)
db.users.insertOne({
  email: "admin@example.com",
  password: "$2a$10$...", // bcrypt hash of your password
  firstName: "Admin",
  lastName: "User",
  role: "superadmin",
  emailVerified: true,
  isActive: true,
  createdAt: new Date(),
  updatedAt: new Date()
});
```

Alternatively, register normally and update the role in the database:
```javascript
db.users.updateOne(
  { email: "your@email.com" },
  { $set: { role: "superadmin" } }
);
```

### Access Dashboards

- Student Dashboard: `http://localhost:5173/student/dashboard`
- Instructor Dashboard: `http://localhost:5173/instructor/dashboard`
- Custodian Dashboard: `http://localhost:5173/custodian/dashboard`
- Superadmin Dashboard: `http://localhost:5173/superadmin/dashboard`
- User Management: `http://localhost:5173/superadmin/users` (superadmin only)

## Project Structure

```
src/
├── routes/
│   ├── auth/                      # Authentication pages
│   │   ├── login/                 # Login page
│   │   ├── register/              # Registration page
│   │   ├── forgot-password/       # Password reset request
│   │   ├── reset-password/        # New password entry
│   │   └── verify-email/          # Email verification
│   ├── (protected)/               # Protected routes
│   │   ├── student/               # Student-specific pages
│   │   │   ├── dashboard/         # Student dashboard
│   │   │   ├── catalog/           # Equipment catalog
│   │   │   ├── request/           # New borrowing request
│   │   │   ├── requests/         # Request history
│   │   │   ├── borrowed/          # Currently borrowed items
│   │   │   ├── support/          # AI help desk
│   │   │   └── account/           # Account management
│   │   │       ├── profile/       # Profile settings
│   │   │       ├── settings/      # Account settings
│   │   │       ├── history/       # Activity history
│   │   │       ├── notifications/ # Notification center
│   │   │       └── help/          # Help center
│   │   ├── instructor/            # Instructor-specific pages
│   │   │   ├── dashboard/         # Instructor dashboard
│   │   │   ├── catalog/           # Equipment catalog
│   │   │   ├── requests/         # Student requests
│   │   │   ├── inventory/         # Inventory overview
│   │   │   ├── reports/           # Reports and exports
│   │   │   ├── messages/          # Communication
│   │   │   ├── notifications/     # Notification center
│   │   │   └── account/           # Account management
│   │   │       ├── profile/       # Profile settings
│   │   │       ├── settings/      # Account settings
│   │   │       ├── history/       # Activity history
│   │   │       ├── statistics/    # Class statistics
│   │   │       └── help/          # Help center
│   │   ├── custodian/             # Custodian-specific pages
│   │   │   ├── dashboard/         # Custodian dashboard
│   │   │   ├── inventory/         # Inventory management
│   │   │   ├── requests/         # Request processing
│   │   │   ├── history/           # Processing history
│   │   │   ├── replacement/       # Damage/loss tracking
│   │   │   ├── reports/           # Reports and exports
│   │   │   ├── notifications/     # Notification center
│   │   │   └── account/           # Account management
│   │   │       ├── profile/       # Profile settings
│   │   │       ├── settings/      # Account settings
│   │   │       └── help/          # Help center
│   │   └── superadmin/            # Superadmin-specific pages
│   │       ├── dashboard/         # Superadmin dashboard
│   │       ├── users/             # User management
│   │       ├── analytics/         # System analytics
│   │       ├── audit/             # Audit logs
│   │       ├── class-codes/       # Class code management
│   │       ├── database/          # Database management
│   │       ├── inventory/         # Inventory configuration
│   │       ├── notifications/     # Notification center
│   │       └── account/           # Account management
│   │           └── profile/       # Profile settings
│   ├── api/                       # API endpoints
│   │   ├── auth/                  # Authentication APIs
│   │   ├── ai-chat/               # AI chat streaming endpoint
│   │   ├── dashboard/             # Dashboard statistics
│   │   └── users/                 # User management CRUD
│   ├── privacy/                   # Privacy policy page
│   └── terms/                     # Terms and conditions page
├── lib/
│   ├── components/
│   │   ├── ui/                    # Reusable UI components
│   │   ├── landing/               # Landing page components
│   │   └── admin/                 # Admin-specific components
│   ├── stores/                    # Svelte stores
│   └── server/                    # Server-side code
│       ├── models/                # Data models
│       ├── utils/                 # Utilities (JWT, password, etc.)
│       ├── middleware/            # Request middleware
│       │   ├── auth/              # Authentication middleware
│       │   ├── rateLimit/         # Rate limiting middleware
│       │   └── security/          # Security middleware
│       ├── services/              # Business logic
│       │   ├── aiChat/            # AI chat orchestration
│       │   ├── auth/              # Authentication services
│       │   ├── email/             # Email services
│       │   ├── statistics/        # Statistics services
│       │   ├── storage/           # Storage services
│       │   └── notifications/     # Notification services
│       ├── db/                    # Database utilities
│       │   ├── indexes/           # Database indexes
│       │   └── migrations/        # Database migrations
│       ├── cache/                 # Caching strategies
│       │   ├── strategies/        # Cache strategy implementations
│       │   └── examples/          # Cache usage examples
│       ├── realtime/              # Real-time features
│       └── errors/                # Error handling
├── scripts/                       # Utility scripts
│   ├── generate-pwa-icons.js      # PWA icon generation
│   ├── purge-catalog-and-requests.cjs  # Data cleanup
│   └── seed-demo-analytics-data.cjs     # Demo data seeding
└── static/                        # Static assets
```

## Deployment

### Production Build

```sh
npm run build
```

### Preview Production Build

```sh
npm run preview
```

### Deployment Platforms

- **Vercel**: Zero-config deployment with automatic builds
- **Netlify**: Automatic builds and deployments
- **Custom Server**: Node.js server with adapter-node

Refer to [SvelteKit adapters](https://svelte.dev/docs/kit/adapters) for additional deployment options.

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

[Your License Here]

## Support

For issues or questions:
1. Review the documentation files
2. Check the Postman collection examples
3. Inspect browser console for frontend errors
4. Review server logs for backend errors
5. Contact the development team

---

Built with SvelteKit
