export function KOTItem({ item }) {
  return (
    <div className="kot-item">
      <div className="item-main">
        <span className="qty">{item.qty}x</span>
        <span className="name">{item.item_name || item.item}</span>
      </div>
      {item.notes && (
        <div className="item-notes">
          <i className="fa fa-note-sticky"></i>
          <span>{item.notes}</span>
        </div>
      )}
      {item.variant_of && (
        <div className="item-variant">
          <small>({item.variant_of})</small>
        </div>
      )}
    </div>
  )
}
