import React from 'react'

/**
 * Skeleton Loaders untuk Cashier Console
 */

export function OrderCardSkeleton() {
  return (
    <div className="order-card order-card-skeleton">
      <div className="order-card-header">
        <div className="skeleton-shimmer skeleton-order-number"></div>
        <div className="skeleton-shimmer skeleton-order-badge"></div>
      </div>
      <div className="order-card-body">
        <div className="skeleton-shimmer skeleton-order-customer"></div>
        <div className="skeleton-shimmer skeleton-order-table"></div>
        <div className="skeleton-shimmer skeleton-order-items"></div>
      </div>
      <div className="order-card-footer">
        <div className="skeleton-shimmer skeleton-order-total"></div>
      </div>
    </div>
  )
}

export function OrderListSkeleton() {
  return (
    <div className="order-list-skeleton">
      {[1, 2, 3, 4, 5].map((i) => (
        <OrderCardSkeleton key={i} />
      ))}
    </div>
  )
}

export function CatalogItemSkeleton() {
  return (
    <div className="catalog-item catalog-item-skeleton">
      <div className="catalog-item-image skeleton-shimmer"></div>
      <div className="catalog-item-info">
        <div className="skeleton-shimmer skeleton-item-name"></div>
        <div className="skeleton-shimmer skeleton-item-price"></div>
      </div>
    </div>
  )
}

export function CatalogGridSkeleton() {
  return (
    <div className="catalog-grid-skeleton">
      {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
        <CatalogItemSkeleton key={i} />
      ))}
    </div>
  )
}

export function OrderDetailSkeleton() {
  return (
    <div className="order-detail-skeleton">
      <div className="order-detail-header">
        <div className="skeleton-shimmer skeleton-order-title"></div>
        <div className="skeleton-shimmer skeleton-order-status"></div>
      </div>
      <div className="order-detail-items">
        {[1, 2, 3].map((i) => (
          <div key={i} className="order-item-skeleton">
            <div className="skeleton-shimmer skeleton-item-row"></div>
          </div>
        ))}
      </div>
      <div className="order-detail-summary">
        <div className="skeleton-shimmer skeleton-summary-row"></div>
        <div className="skeleton-shimmer skeleton-summary-row"></div>
        <div className="skeleton-shimmer skeleton-summary-total"></div>
      </div>
    </div>
  )
}
