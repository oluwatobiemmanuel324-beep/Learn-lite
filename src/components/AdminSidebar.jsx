import React, { useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Sun,
  Moon,
  X,
  BarChart3,
  DollarSign,
  BookOpen,
  Users,
  Share2,
  LogOut,
  Settings,
  Shield,
  TrendingUp,
  UserRound,
  PencilLine,
  Mail,
  BriefcaseBusiness
} from 'lucide-react';
import { authAPI, getApiErrorMessage } from '../services/api';
import { useApp } from '../context/AppContext';
import '../styles/admin-sidebar.css';

function safeParseUser(rawValue) {
  try {
    const parsed = JSON.parse(rawValue || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export default function AdminSidebar() {
  const [isOpen, setIsOpen] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const { theme, toggleTheme } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const currentUser = safeParseUser(localStorage.getItem('learn_lite_user'));
  const role = localStorage.getItem('user_role') || 'USER';
  const professionalProfileKey = `learn_lite_staff_profile_${currentUser.id || currentUser.email || 'unknown'}`;
  const savedProfile = safeParseUser(localStorage.getItem(professionalProfileKey));

  const [profileForm, setProfileForm] = useState({
    fullName: savedProfile.fullName || currentUser.username || 'Staff User',
    title: savedProfile.title || '',
    profilePicture: savedProfile.profilePicture || '',
    professionalBio: savedProfile.professionalBio || '',
    newPassword: '',
    confirmPassword: ''
  });

  const roleConfig = {
    SYSTEM_OWNER: {
      title: 'Control Tower',
      icon: Shield,
      color: '#8B5CF6',
      path: '/dashboard/system-owner',
      items: [
        { label: 'Command Center', icon: BarChart3, path: '/dashboard/system-owner' },
        { label: 'Root Admin Room', icon: Settings, path: '/dashboard/root-admin' },
        { label: 'Finance Room', icon: DollarSign, path: '/dashboard/finance-controller' },
        { label: 'Academic Room', icon: BookOpen, path: '/dashboard/academic-registrar' },
        { label: 'Ops Room', icon: Users, path: '/dashboard/ops-moderator' },
        { label: 'Social Room', icon: Share2, path: '/dashboard/social-media-controller' }
      ]
    },
    FINANCE_CONTROLLER: {
      title: 'Revenue Stream',
      icon: DollarSign,
      color: '#10B981',
      path: '/dashboard/finance-controller',
      items: [
        { label: 'Finance Dashboard', icon: TrendingUp, path: '/dashboard/finance-controller' }
      ]
    },
    ACADEMIC_REGISTRAR: {
      title: 'Content Hub',
      icon: BookOpen,
      color: '#3B82F6',
      path: '/dashboard/academic-registrar',
      items: [
        { label: 'Academic Dashboard', icon: BarChart3, path: '/dashboard/academic-registrar' }
      ]
    },
    OPS_MODERATOR: {
      title: 'Health Monitor',
      icon: Users,
      color: '#F59E0B',
      path: '/dashboard/ops-moderator',
      items: [
        { label: 'Ops Dashboard', icon: Users, path: '/dashboard/ops-moderator' }
      ]
    },
    SOCIAL_MEDIA_CONTROLLER: {
      title: 'Growth Hub',
      icon: Share2,
      color: '#EC4899',
      path: '/dashboard/social-media-controller',
      items: [
        { label: 'Social Dashboard', icon: TrendingUp, path: '/dashboard/social-media-controller' }
      ]
    }
  };

  const config = roleConfig[role] || roleConfig.SYSTEM_OWNER;
  const RoleIcon = config.icon;
  const professionalTitleByRole = {
    SYSTEM_OWNER: 'Executive System Owner',
    ROOT_ADMIN: 'Senior Root Administrator',
    ADMIN: 'Root Admin Officer',
    FINANCE_CONTROLLER: 'Senior Financial Controller',
    ACADEMIC_REGISTRAR: 'Senior Academic Registrar',
    OPS_MODERATOR: 'Operations Moderation Lead',
    SOCIAL_MEDIA_CONTROLLER: 'Senior Social Media Controller'
  };

  const staffProfile = useMemo(() => {
    const fullName = profileForm.fullName || currentUser.username || 'Staff User';
    const title = profileForm.title || professionalTitleByRole[role] || 'Professional Staff';
    const email = currentUser.email || 'staff@learnlite.app';
    const picture = profileForm.profilePicture || '';
    return { fullName, title, email, picture };
  }, [currentUser.email, currentUser.username, profileForm.fullName, profileForm.profilePicture, profileForm.title, role]);

  const handleLogout = () => {
    localStorage.removeItem('learn_lite_token');
    localStorage.removeItem('learn_lite_user');
    localStorage.removeItem('user_id');
    localStorage.removeItem('user_role');
    window.dispatchEvent(new Event('learnlite-auth-changed'));
    navigate('/login');
  };

  const isActive = (path) => location.pathname === path;

  const handleOfficeSwitch = (path) => {
    setIsOpen(false);
    if (location.pathname !== path) {
      navigate(path);
    }
  };

  const handleProfilePictureUpload = (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      alert('Please select a valid image file.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      setProfileForm((prev) => ({ ...prev, profilePicture: String(reader.result || '') }));
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async () => {
    if (profileForm.newPassword || profileForm.confirmPassword) {
      if (profileForm.newPassword.length < 6) {
        alert('Password must be at least 6 characters.');
        return;
      }
      if (profileForm.newPassword !== profileForm.confirmPassword) {
        alert('Password confirmation does not match.');
        return;
      }
    }

    try {
      setIsSavingProfile(true);

      if (profileForm.newPassword) {
        await authAPI.updateProfile({ password: profileForm.newPassword });
      }

      localStorage.setItem(professionalProfileKey, JSON.stringify({
        fullName: profileForm.fullName,
        title: profileForm.title || professionalTitleByRole[role] || 'Professional Staff',
        profilePicture: profileForm.profilePicture,
        professionalBio: profileForm.professionalBio
      }));

      setProfileForm((prev) => ({ ...prev, newPassword: '', confirmPassword: '' }));
      setIsProfileModalOpen(false);
      alert('Profile updated successfully.');
    } catch (err) {
      alert(getApiErrorMessage(err, 'Failed to update profile.'));
    } finally {
      setIsSavingProfile(false);
    }
  };

  return (
    <>
      <motion.button
        className="drawer-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        aria-label={isOpen ? 'Close navigation menu' : 'Open navigation menu'}
      >
        <span className="hamburger-icon" aria-hidden="true">
          <motion.span
            className="hamburger-line"
            animate={isOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
          />
          <motion.span
            className="hamburger-line"
            animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
            transition={{ duration: 0.2 }}
          />
          <motion.span
            className="hamburger-line"
            animate={isOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
            transition={{ duration: 0.2 }}
          />
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <>
            <motion.div
              className="drawer-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsOpen(false)}
            />

            <motion.aside
              className="admin-sidebar drawer-open"
              initial={{ x: -320 }}
              animate={{ x: 0 }}
              exit={{ x: -320 }}
              transition={{ duration: 0.32, ease: 'easeInOut' }}
              style={{ borderLeftColor: config.color }}
            >
              <motion.div className="sidebar-header" style={{ borderBottomColor: config.color }}>
                <motion.div className="sidebar-brand">
                  <RoleIcon size={28} color={config.color} />
                  <h2 style={{ color: config.color }}>{config.title}</h2>
                </motion.div>
                <motion.button
                  className="sidebar-toggle"
                  onClick={() => setIsOpen(false)}
                  whileHover={{ scale: 1.1 }}
                  whileTap={{ scale: 0.95 }}
                >
                  <X size={20} />
                </motion.button>
              </motion.div>

              <nav className="sidebar-nav">
                {config.items.map((item, idx) => {
                  const ItemIcon = item.icon;
                  const active = isActive(item.path);

                  return (
                    <motion.div
                      key={idx}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: idx * 0.04 }}
                    >
                      <Link
                        to={item.path}
                        className={`nav-item ${active ? 'active' : ''}`}
                        style={active ? { borderLeftColor: config.color, backgroundColor: `${config.color}15` } : {}}
                        onClick={(e) => {
                          e.preventDefault();
                          handleOfficeSwitch(item.path);
                        }}
                      >
                        <motion.div className="nav-icon" whileHover={{ scale: 1.15 }} whileTap={{ scale: 0.9 }}>
                          <ItemIcon size={20} color={config.color} />
                        </motion.div>
                        <span>{item.label}</span>
                      </Link>
                    </motion.div>
                  );
                })}
              </nav>

              <motion.div className="sidebar-footer" style={{ borderTopColor: config.color }}>
                <button
                  type="button"
                  className="theme-switch-btn"
                  onClick={toggleTheme}
                  aria-label="Toggle light and dark mode"
                >
                  {theme === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
                  <span>{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
                </button>

                <motion.div className="staff-card" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <div className="staff-avatar-wrap">
                    {staffProfile.picture ? (
                      <img src={staffProfile.picture} alt={staffProfile.fullName} className="staff-avatar-img" />
                    ) : (
                      <div className="user-avatar" style={{ backgroundColor: config.color }}>
                        {staffProfile.fullName.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <div>
                      <p className="user-name">{staffProfile.fullName}</p>
                      <p className="user-role" style={{ color: '#cbd5e1' }}><BriefcaseBusiness size={12} /> {staffProfile.title}</p>
                      <p className="user-role" style={{ display: 'flex', alignItems: 'center', gap: 4 }}><Mail size={12} /> {staffProfile.email}</p>
                    </div>
                  </div>

                  <button
                    type="button"
                    className="profile-edit-btn"
                    onClick={() => setIsProfileModalOpen(true)}
                  >
                    <PencilLine size={14} /> Edit Profile
                  </button>
                </motion.div>

                <motion.button
                  className="logout-btn"
                  onClick={handleLogout}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  style={{ color: config.color, borderColor: config.color }}
                >
                  <LogOut size={18} />
                  <span>Logout</span>
                </motion.button>
              </motion.div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isProfileModalOpen && (
          <>
            <motion.div
              className="profile-modal-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsProfileModalOpen(false)}
            />

            <motion.div
              className="profile-modal"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 20 }}
            >
              <h3><UserRound size={18} /> Staff Profile</h3>
              <input
                className="profile-input"
                placeholder="Full Name"
                value={profileForm.fullName}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, fullName: e.target.value }))}
              />
              <input
                className="profile-input"
                placeholder="Professional Title"
                value={profileForm.title || professionalTitleByRole[role] || ''}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, title: e.target.value }))}
              />
              <input
                className="profile-input"
                placeholder="Profile Picture URL"
                value={profileForm.profilePicture}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, profilePicture: e.target.value }))}
              />
              <input
                className="profile-input"
                type="file"
                accept="image/*"
                onChange={handleProfilePictureUpload}
              />
              <textarea
                className="profile-input"
                placeholder="Professional Bio"
                rows={4}
                value={profileForm.professionalBio}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, professionalBio: e.target.value }))}
              />
              <input
                className="profile-input"
                type="password"
                placeholder="New Password"
                value={profileForm.newPassword}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, newPassword: e.target.value }))}
              />
              <input
                className="profile-input"
                type="password"
                placeholder="Confirm Password"
                value={profileForm.confirmPassword}
                onChange={(e) => setProfileForm((prev) => ({ ...prev, confirmPassword: e.target.value }))}
              />

              <div className="profile-modal-actions">
                <button type="button" className="secondary" onClick={() => setIsProfileModalOpen(false)}>Cancel</button>
                <button type="button" className="btn" onClick={handleSaveProfile} disabled={isSavingProfile}>
                  {isSavingProfile ? 'Saving...' : 'Save Profile'}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
