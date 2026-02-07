import React from 'react'
import { UI } from '@/shared/api/constants'

/**
 * Skeleton Loader Components untuk loading states
 */

export function ModuleCardSkeleton() {
  return (
    <div className="module-card module-card-skeleton">
      <div className="module-icon skeleton-shimmer"></div>
      <div className="module-content">
        <div className="skeleton-text skeleton-title skeleton-shimmer"></div>
        <div className="skeleton-text skeleton-description skeleton-shimmer"></div>
        <div className="skeleton-text skeleton-description-short skeleton-shimmer"></div>
      </div>
      <div className="module-arrow skeleton-shimmer"></div>
    </div>
  )
}

export function SidebarSkeleton() {
  return (
    <aside className="module-select-sidebar">
      {/* POS Profile Skeleton */}
      <div className="sidebar-section">
        <h3>POS Profile</h3>
        <div className="profile-info-card">
          <div className="skeleton-text skeleton-profile-name skeleton-shimmer"></div>
          <div className="skeleton-text skeleton-branch skeleton-shimmer"></div>
        </div>
      </div>

      {/* User Info Skeleton */}
      <div className="sidebar-section user-section">
        <h3>Account</h3>
        <div className="user-card">
          <div className="user-avatar skeleton-shimmer"></div>
          <div className="user-details">
            <div className="skeleton-text skeleton-user-name skeleton-shimmer"></div>
            <div className="skeleton-text skeleton-user-email skeleton-shimmer"></div>
          </div>
        </div>
      </div>
    </aside>
  )
}

export function GridSkeleton() {
  return (
    <section className="module-select-content">
      <div className="modules-header">
        <h2>Available Modules</h2>
        <p>Loading modules...</p>
      </div>

      <div className="modules-grid">
        {Array.from({ length: UI.SKELETON_GRID_ITEMS }, (_, i) => (
          <ModuleCardSkeleton key={i} />
        ))}
      </div>
    </section>
  )
}
