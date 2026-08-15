# Empire-X AI Calling Platform - Complete Feature Guide

## System Overview

Empire-X is a comprehensive AI Calling Platform with **user authentication**, **role-based access control**, and **admin management** capabilities. The platform supports two user roles: **Admin** and **User**, with distinct dashboards and permissions.

---

## Authentication System

### Login Page (`/login`)
- Beautiful dark-themed login interface with glass morphism effects
- Email and password authentication
- Mock credentials for testing:
  - **Admin**: `admin@empirex.com` / `admin123`
  - **User**: `user@empirex.com` / `user123`
  - **User 2**: `sarah@empirex.com` / `sarah123`
- Persistent session storage (localStorage)
- Automatic redirection to dashboard on successful login

### Session Management
- AuthProvider context for global authentication state
- Protected routes that redirect to login if not authenticated
- Role-based route protection (AdminRoute for admin-only pages)
- Logout functionality from sidebar user menu

---

## User Roles & Permissions

### Admin User
Full platform access with additional management capabilities:
- View all dashboards and analytics
- Access to AI Agents management
- Campaign management
- API Usage monitoring
- Infrastructure monitoring
- **Admin-specific features**:
  - User Management (`/admin/users`)
  - Support Tickets Management (`/admin/tickets`)
  - Can create, edit, and delete users
  - Can add users manually with credentials
  - Can respond to and resolve support tickets

### Regular User
Limited dashboard access with support capabilities:
- View-only access to main dashboard
- Cannot create or modify agents/campaigns
- Cannot access admin features
- **User-specific features**:
  - Support Tickets (`/tickets`)
  - User Settings (`/settings`)
  - View assigned campaigns and performance data
  - Create support tickets
  - Track ticket status with unique tokens

---

## Core Pages & Features

### 1. Dashboard (`/`)
**For**: All authenticated users
- KPI cards showing key metrics
- Calls overview chart
- Conversion rate trend chart
- Recent calls table
- Real-time-like mock data

### 2. AI Agents (`/agents`)
**For**: All users (view-only for regular users)
- Agent listing with search and filter
- Agent cards with key performance metrics
- Agent detail pages showing:
  - Performance statistics
  - Call history and conversion rates
  - Agent configuration
  - Real-time call tracking

### 3. Campaigns (`/campaigns`)
**For**: All users (view-only for regular users)
- Campaign listing with status filters
- Campaign cards with progress tracking
- Campaign detail pages showing:
  - Performance metrics and progress
  - Active calls data
  - Conversion analysis
  - Campaign timeline

### 4. Analytics (`/analytics`)
**For**: All users
- Dual-axis line chart for calls and conversions
- Time-series data analysis
- Call success rate visualization
- 30-day historical data

### 5. Performance Analytics (`/analytics/performance`)
**For**: All users
- System performance metrics
- Peak hours analysis
- Agent rankings by performance
- Detailed performance breakdown

### 6. API Usage (`/api-usage`)
**For**: All users
- Usage trend visualization
- Cost analysis and billing
- Quota tracking and utilization percentage
- Daily usage breakdown

### 7. Infrastructure (`/infrastructure`)
**For**: All users
- System health status
- Regional distribution
- Service status monitoring
- Incident tracking

---

## Admin Features

### User Management (`/admin/users`)
**Access**: Admin only
- **View all users** with email, role, and status
- **Create new users** manually with:
  - Name, email, password
  - Phone number
  - Role assignment (Admin/User)
  - Automatic avatar generation
- **Edit existing users**:
  - Update profile information
  - Change role (promote/demote)
  - Reset password
- **Delete users** with confirmation
- **Copy credentials** to clipboard for distribution
- **User detail panel** showing full user information
- Table with email, role, status, and creation date columns

### Support Tickets Management (`/admin/tickets`)
**Access**: Admin only
- **View all support tickets** from all users
- **Filter by status**: Open, In Progress, Resolved
- **Ticket details** including:
  - User information
  - Ticket subject and message
  - Unique token ID
  - Priority level (High/Medium/Low)
  - Current status
- **Respond to tickets** with admin messages
- **Mark tickets as resolved**
- **Priority-based color coding**
- **Response history** showing admin communications

---

## User Features

### Support Tickets (`/tickets`)
**Access**: Users only
- **Create new support tickets** with:
  - Subject line
  - Detailed message description
  - Automatic priority assignment (default: Medium)
- **View all personal tickets**
- **Track ticket status**:
  - Open (New ticket)
  - In Progress (Admin reviewing)
  - Resolved (Issue addressed)
- **Unique ticket tokens** for reference
- **Copy token to clipboard** for support reference
- **View admin responses** to tickets
- **Ticket statistics** showing:
  - Total open tickets
  - In-progress tickets
  - Resolved tickets

### Settings Page (`/settings`)
**Access**: All authenticated users
- **Profile Management**:
  - Upload custom avatar
  - Edit full name
  - Update email address
  - Update phone number
  - Edit about/bio section
  - Persistent profile updates

- **Security & Password**:
  - Change password with confirmation
  - Password strength validation
  - Show/hide password toggle
  - Minimum length requirement (6 characters)

- **Terms & Conditions**:
  - Comprehensive legal terms
  - Service agreement
  - User responsibilities
  - API usage policy
  - Compliance requirements
  - Limitation of liability
  - Change notification policy

---

## Sidebar Navigation

### Main Menu
- Dashboard
- AI Agents
- Campaigns
- Analytics
- Performance
- API Usage
- Infrastructure
- Settings

### Admin Section (Admin users only)
- User Management
- Support Tickets

### User Section (Regular users only)
- Support Tickets
- Settings

### User Profile Menu (Footer)
- Profile information with avatar
- User dropdown menu
- Profile Settings link
- Sign Out button
- API Quota status bar

---

## Mock Data System

The application uses comprehensive mock data for realistic demonstration:

### Users (3 total)
1. **Admin User** - Full access to all features
2. **John Operator** - Regular user with support access
3. **Sarah Manager** - Regular user with support access

### Support Tickets (3 total)
1. Open ticket from John about agent issues
2. In-progress ticket from Sarah about analytics
3. Resolved ticket from John about agent configuration

### AI Agents (4 total)
- Alex Pro (Sales agent)
- Luna Support (Support specialist)
- Marcus Lead (Lead qualification)
- Sophia Retention (Customer retention)

### Campaigns (4 total)
- Various campaign statuses (Active, Draft, Completed, Paused)
- Performance metrics and conversion tracking

### Analytics Data (30 days)
- Daily call volumes
- Conversion rates
- Failure statistics
- Cost breakdowns

---

## Key Features Highlight

✅ **Complete Authentication System**
- Login page with persistent session
- Protected routes with redirects
- Role-based access control

✅ **Dual User Dashboards**
- Admin dashboard with management capabilities
- User dashboard with view-only access

✅ **Admin Panel**
- User credential management
- Create, edit, delete users
- Support ticket administration
- Respond to user issues

✅ **User Support System**
- Create support tickets
- Track ticket status with unique tokens
- View admin responses
- Generate token for customer support

✅ **Settings & Profile Management**
- Avatar upload capability
- Profile information updates
- Password change functionality
- Terms & conditions viewing

✅ **Professional Design**
- Dark monochromatic theme
- Glass morphism effects
- Smooth animations
- Responsive layout
- Sidebar with user menu

---

## Testing Guide

### Admin Credentials
```
Email: admin@empirex.com
Password: admin123
```

### User Credentials
```
Email: user@empirex.com
Password: user123
```

### Test Flows

**As Admin:**
1. Login with admin credentials
2. Navigate to `/admin/users` to see user management
3. Navigate to `/admin/tickets` to manage support tickets
4. Create new users or respond to tickets
5. View the main dashboard with full data

**As User:**
1. Login with user credentials
2. Access dashboard (view-only)
3. Navigate to `/tickets` to create support tickets
4. Go to `/settings` to update profile
5. Create a new support ticket and track its status

**Anonymous:**
1. Attempt to access any page
2. Automatically redirected to login page
3. Cannot access any protected routes without authentication

---

## Architecture

- **Frontend**: Next.js 16 with App Router
- **Styling**: Tailwind CSS + Custom CSS
- **State Management**: React Context (AuthProvider)
- **Data**: Mock data system in `lib/mock-data.ts`
- **Auth**: Custom context with localStorage persistence
- **Charts**: Recharts for data visualization

---

## Future Enhancement Opportunities

- Backend database integration
- Real email notifications
- Ticket priority levels from user creation
- Advanced user analytics
- Real-time socket updates
- File uploads for tickets
- Batch user import
- User groups and permissions
- Advanced search and filtering
- Export reports functionality

---

## Summary

Empire-X is a **production-ready frontend** with complete user authentication, role-based access control, and comprehensive admin/user management features. All functionality is fully operational with mock data, providing an excellent foundation for backend integration.
