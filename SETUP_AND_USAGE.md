# Empire-X AI Calling Platform - Setup & Usage Guide

## Getting Started

### Installation

The project is pre-configured and ready to run. To start the development server:

```bash
cd /vercel/share/v0-project
pnpm dev
```

The application will be available at `http://localhost:3000`

---

## Quick Start Guide

### 1. First Time Access
- Open `http://localhost:3000`
- You will be automatically redirected to the login page (`/login`)
- Use one of the demo credentials to sign in

### 2. Demo Credentials

#### Admin Account (Full Access)
```
Email:    admin@empirex.com
Password: admin123
```

#### User Account (Limited Access)
```
Email:    user@empirex.com
Password: user123
```

#### User Account 2 (Limited Access)
```
Email:    sarah@empirex.com
Password: sarah123
```

---

## Navigation & Routing

### Public Routes
- `/login` - Login page (accessible only when not authenticated)

### Protected Routes (All authenticated users)
- `/` - Dashboard
- `/agents` - AI Agents management
- `/agents/[id]` - Agent detail page
- `/campaigns` - Campaigns management
- `/campaigns/[id]` - Campaign detail page
- `/analytics` - Analytics overview
- `/analytics/performance` - Performance analytics
- `/api-usage` - API usage monitoring
- `/infrastructure` - Infrastructure health
- `/settings` - User profile and settings
- `/tickets` - User support tickets (regular users)

### Admin-Only Routes
- `/admin/users` - User management (create, edit, delete users)
- `/admin/tickets` - Support ticket management (respond, resolve)

---

## User Workflows

### For Regular Users

#### Workflow 1: View Dashboard
1. Login with user credentials
2. Dashboard loads with KPI cards and charts
3. View recent calls and performance metrics
4. Click on agents/campaigns to see more details

#### Workflow 2: Create Support Ticket
1. From sidebar, click "Support Tickets"
2. Click "New Ticket" button
3. Fill in subject and detailed message
4. Click "Create Ticket"
5. Receive unique ticket token for reference
6. Track ticket status from the list
7. View admin response when ticket is in progress

#### Workflow 3: Update Profile
1. From sidebar, click "Settings"
2. Upload new avatar by clicking the image area
3. Update name, email, or phone number
4. Click "Save Profile"
5. Change password in the Security section
6. View Terms & Conditions at the bottom

---

### For Admin Users

#### Workflow 1: Manage Users
1. From sidebar "Admin" section, click "User Management"
2. View all users in a table with email, role, and status
3. To create new user:
   - Click "Add User" button
   - Fill in name, email, password, phone
   - Select role (Admin or User)
   - Click "Create"
4. To edit user:
   - Click edit icon next to user
   - Update information
   - Click "Update"
5. To delete user:
   - Click trash icon
   - Confirm deletion
6. To copy credentials:
   - Click copy icon
   - Credentials copied to clipboard
7. Click on a user to see full details panel

#### Workflow 2: Manage Support Tickets
1. From sidebar "Admin" section, click "Support Tickets"
2. Filter tickets by status: All, Open, In Progress, Resolved
3. Select a ticket to view details
4. To respond:
   - Type response in text area
   - Click "Send Response"
   - Ticket status changes to "In Progress"
5. To resolve:
   - Click "Mark Resolved" button
   - Ticket status changes to "Resolved"
6. View user information and ticket creation date
7. Copy ticket token for reference

#### Workflow 3: Respond to Ticket
1. Open a ticket from the tickets list
2. Read the user's message
3. Type your response in the response box
4. Click "Send Response"
5. Your response is added and ticket moves to "In Progress"
6. User can see your response in their ticket details
7. Close ticket by clicking "Mark Resolved"

---

## Key Features Demonstration

### Feature 1: Authentication & Session Persistence
```
1. Login with admin@empirex.com / admin123
2. Refresh page - you stay logged in (stored in localStorage)
3. Close browser tab and reopen - you remain logged in
4. Click "Sign Out" in sidebar menu
5. Redirected to login page
6. Try to access protected route - redirected to login
```

### Feature 2: Role-Based Access Control
```
As Admin:
1. Can see "User Management" in sidebar
2. Can see "Support Tickets" in sidebar
3. Can access /admin/users and /admin/tickets

As Regular User:
1. Cannot see admin section in sidebar
2. Can see "Support Tickets" in sidebar
3. Cannot access /admin/users (redirected to dashboard)
```

### Feature 3: User Credential Management
```
1. Login as admin
2. Go to User Management
3. Click "Add User" to create new user with specific credentials
4. Use "Copy" button to get email and password
5. Share credentials with new user
6. New user can login with those credentials
```

### Feature 4: Support Ticket System
```
As User:
1. Click "Support Tickets" in sidebar
2. Click "New Ticket"
3. Receive unique token (e.g., TKT-2024-004-ABC123)
4. Wait for admin to respond
5. Track status: Open → In Progress → Resolved

As Admin:
1. See ticket from user in "Support Tickets" page
2. Click on ticket to view details
3. Type response message
4. Click "Send Response" to notify user
5. Click "Mark Resolved" when done
```

### Feature 5: Profile Management
```
1. Click "Settings" in sidebar
2. Upload a new avatar by clicking the image area
3. Update name, email, phone
4. Write about yourself
5. Click "Save Profile"
6. Change password - enter new password twice
7. Click "Change Password"
8. View Terms & Conditions at bottom
```

---

## Mock Data Overview

### Users
- **Admin User**: admin@empirex.com (admin123)
- **John Operator**: user@empirex.com (user123)
- **Sarah Manager**: sarah@empirex.com (sarah123)

### Support Tickets
- 3 sample tickets with different statuses (Open, In Progress, Resolved)
- Each ticket has a unique token for reference
- Can create new tickets which are stored in component state

### AI Agents
- Alex Pro (Sales specialist) - Active
- Luna Support (Support agent) - Active
- Marcus Lead (Lead qualification) - Active
- Sophia Retention (Retention specialist) - Inactive

### Campaigns
- 4 sample campaigns with various statuses and performance metrics

### Analytics
- 30 days of mock data with daily metrics
- Call volumes, conversion rates, and cost data

---

## State Management

### Authentication State (Global)
```javascript
// Access auth context anywhere
const { user, isLoggedIn, login, logout, updateProfile } = useAuth();

// user object contains:
{
  id: string
  email: string
  name: string
  role: 'admin' | 'user'
  phone: string
  avatar: string
  about: string
  created_at: Date
  status: 'active' | 'inactive'
}
```

### Component State (Local)
- Each page manages its own state
- User data, forms, modals, filters all use `useState`
- No external state management library needed for current functionality

### Data Persistence
- User session: stored in localStorage as JSON
- Component state: stored in component memory
- Mock data: imported from `lib/mock-data.ts`

---

## File Structure

```
app/
├── login/page.tsx              # Login page
├── page.tsx                    # Dashboard (protected)
├── agents/
│   ├── page.tsx               # Agents list
│   └── [id]/page.tsx          # Agent detail
├── campaigns/
│   ├── page.tsx               # Campaigns list
│   └── [id]/page.tsx          # Campaign detail
├── analytics/
│   ├── page.tsx               # Analytics dashboard
│   └── performance/page.tsx   # Performance analytics
├── api-usage/page.tsx         # API usage page
├── infrastructure/page.tsx    # Infrastructure page
├── settings/page.tsx          # Settings page (protected)
├── tickets/page.tsx           # User tickets (protected)
├── admin/
│   ├── users/page.tsx         # User management (admin only)
│   └── tickets/page.tsx       # Ticket management (admin only)
└── layout.tsx                 # Root layout with AuthProvider

components/
├── layout/
│   ├── Sidebar.tsx           # Navigation sidebar with user menu
│   ├── Header.tsx            # Page header with breadcrumbs
│   └── MainLayout.tsx        # Main wrapper component
├── dashboard/
│   ├── KPICards.tsx          # KPI metrics cards
│   ├── CallsChart.tsx        # Calls volume chart
│   ├── ConversionChart.tsx   # Conversion rate chart
│   └── RecentCalls.tsx       # Recent calls table
├── common/
│   ├── Card.tsx              # Reusable card component
│   ├── Badge.tsx             # Status badges
│   └── Table.tsx             # Table component
└── ProtectedRoute.tsx        # Protected route wrapper

lib/
├── auth-context.tsx          # Authentication context
├── mock-data.ts              # All mock data
└── utils.ts                  # Utility functions

FEATURES.md                    # Complete feature guide
SETUP_AND_USAGE.md            # This file
```

---

## Customization Guide

### Changing Login Credentials
Edit `lib/mock-data.ts`:
```javascript
export const mockUsers = [
  {
    id: '1',
    email: 'newemail@example.com',
    password: 'newpassword',
    name: 'New User',
    // ... other fields
  },
];
```

### Adding New Users
1. Login as admin
2. Go to User Management
3. Click "Add User"
4. Fill in details and submit
5. New user appears in table

### Modifying Mock Data
All mock data can be edited in `lib/mock-data.ts`:
- `mockUsers` - User accounts
- `mockTickets` - Support tickets
- `mockAgents` - AI agents
- `mockCampaigns` - Campaigns
- Analytics data arrays

### Changing Sidebar Menu
Edit `components/layout/Sidebar.tsx`:
```javascript
const mainMenuItems = [
  {
    label: 'Your Label',
    href: '/your-route',
    icon: YourIcon,
  },
];
```

---

## Troubleshooting

### Session Lost After Refresh
- Check localStorage: Open DevTools → Application → localStorage
- Look for key: `empirex_user`
- If missing, try logging in again

### Cannot Access Admin Routes
- Verify you're logged in with admin account
- Check user role in browser DevTools Console: `console.log(localStorage.getItem('empirex_user'))`
- Should show `"role":"admin"`

### Modals or Dropdowns Not Showing
- Check browser console for errors
- Ensure JavaScript is enabled
- Try clearing browser cache

### Dev Server Not Starting
```bash
# Kill existing process
pkill -f "pnpm dev"

# Clear node_modules and reinstall
rm -rf node_modules
pnpm install

# Start fresh
pnpm dev
```

---

## Performance Optimization

The application is already optimized with:
- Lazy loading of components
- CSS optimization with Tailwind
- Efficient mock data loading
- Local state management (no unnecessary re-renders)
- Image optimization with next/image

---

## Security Notes

**This is a demonstration/prototype with mock authentication.**

For production:
- ✅ Use real backend authentication (JWT, OAuth, etc.)
- ✅ Hash passwords before transmission
- ✅ Remove mock credentials from code
- ✅ Implement HTTPS only
- ✅ Use secure session management (httpOnly cookies)
- ✅ Validate all user input server-side
- ✅ Implement rate limiting
- ✅ Use environment variables for secrets

---

## Next Steps & Enhancements

### Backend Integration
1. Replace mock data with real API calls
2. Add database for persistent storage
3. Implement real authentication system
4. Add file upload functionality

### Additional Features
1. Real-time notifications
2. Advanced search and filtering
3. Reporting and export functionality
4. User groups and permissions
5. Audit logging
6. Two-factor authentication

---

## Support

For issues or questions:
1. Check FEATURES.md for complete feature documentation
2. Review file structure above for code organization
3. Inspect browser DevTools for error messages
4. Check localStorage for session state
5. Verify all dependencies are installed: `pnpm install`

---

**Enjoy using Empire-X AI Calling Platform!**
