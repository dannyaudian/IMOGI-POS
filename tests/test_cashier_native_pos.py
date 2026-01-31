"""
Comprehensive tests for Cashier API (Native POS Cycle)
Tests the full ERPNext v15+ POS workflow:
- Opening → Invoice → Payment → Complete → Closing
"""

import pytest
import json
from unittest.mock import Mock, patch, MagicMock
from datetime import datetime


class TestCashierNativePOSCycle:
    """Test full POS cycle with proper mocking"""

    @pytest.fixture
    def mock_frappe(self):
        """Mock frappe module"""
        with patch('imogi_pos.api.cashier.frappe') as mock:
            mock.session.user = "test@example.com"
            mock.has_role = Mock(return_value=True)
            mock.db.exists = Mock(return_value=True)
            mock.db.get_value = Mock(return_value="Test Company")
            mock.db.sql = Mock(return_value=[])
            mock.db.set_value = Mock()
            mock.db.commit = Mock()
            mock.db.rollback = Mock()
            mock.get_doc = Mock()
            mock.get_all = Mock(return_value=[])
            mock.new_doc = Mock()
            mock.get_meta = Mock()
            mock.throw = Mock(side_effect=Exception)
            mock._ = lambda x: x
            yield mock

    @pytest.fixture
    def mock_pos_order(self):
        """Mock POS Order document"""
        order = Mock()
        order.name = "POS-ORD-2026-00001"
        order.pos_profile = "Test POS Profile"
        order.company = "Test Company"
        order.customer = "CUST-001"
        order.table = "T-01"
        order.workflow_state = "Submitted"
        order.sales_invoice = None
        order.items = [
            Mock(
                item_code="ITEM-001",
                item_name="Test Item",
                qty=2,
                rate=100,
                amount=200,
                description="Test",
                uom="Nos"
            )
        ]
        order.save = Mock()
        order.as_dict = Mock(return_value={"name": order.name})
        return order

    @pytest.fixture
    def mock_sales_invoice(self):
        """Mock Sales Invoice document"""
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        invoice.doctype = "Sales Invoice"
        invoice.customer = "CUST-001"
        invoice.company = "Test Company"
        invoice.grand_total = 200.0
        invoice.is_pos = 1
        invoice.pos_profile = "Test POS Profile"
        invoice.imogi_pos_session = "POS-OPN-2026-00001"
        invoice.imogi_pos_order = "POS-ORD-2026-00001"
        invoice.payments = []
        invoice.items = []
        invoice.append = Mock()
        invoice.set = Mock()
        invoice.run_method = Mock()
        invoice.save = Mock()
        invoice.submit = Mock(side_effect=lambda: setattr(invoice, 'docstatus', 1))
        invoice.insert = Mock()
        return invoice

    @pytest.fixture
    def mock_pos_opening(self):
        """Mock POS Opening Entry"""
        opening = Mock()
        opening.name = "POS-OPN-2026-00001"
        opening.docstatus = 1
        opening.company = "Test Company"
        opening.pos_profile = "Test POS Profile"
        opening.user = "test@example.com"
        opening.period_start_date = datetime.now()
        opening.balance_details = [
            Mock(mode_of_payment="Cash", opening_amount=1000),
            Mock(mode_of_payment="Card", opening_amount=0)
        ]
        opening.insert = Mock()
        opening.submit = Mock()
        return opening

    def test_create_invoice_requires_active_opening(self, mock_frappe, mock_pos_order):
        """Test that create_invoice_from_order fails without active opening"""
        from imogi_pos.api.cashier import create_invoice_from_order
        
        # Mock no active opening
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=None):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                mock_frappe.get_doc.return_value = mock_pos_order
                mock_frappe.get_all.return_value = []  # No KOTs
                
                result = create_invoice_from_order("POS-ORD-2026-00001")
                
                assert result["success"] is False
                assert "No active POS Opening" in result["error"]

    def test_create_invoice_with_active_opening(self, mock_frappe, mock_pos_order, mock_sales_invoice, mock_pos_opening):
        """Test successful invoice creation with active opening"""
        from imogi_pos.api.cashier import create_invoice_from_order
        
        mock_frappe.get_doc.side_effect = lambda dt, name=None: {
            "POS Order": mock_pos_order,
            "Sales Invoice": mock_sales_invoice,
        }.get(dt, mock_sales_invoice)
        
        mock_frappe.new_doc.return_value = mock_sales_invoice
        mock_frappe.get_all.return_value = []  # No KOTs
        mock_frappe.get_meta.return_value.has_field.return_value = True
        mock_frappe.db.get_value.side_effect = lambda dt, filters, field=None: {
            "Customer": None,  # Walk-in not found
            "POS Profile": "Test Company",
        }.get(dt)
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=mock_pos_opening):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    result = create_invoice_from_order("POS-ORD-2026-00001")
                    
                    assert result["success"] is True
                    assert "invoice" in result
                    assert result["grand_total"] == 200.0
                    mock_sales_invoice.insert.assert_called_once()

    def test_create_invoice_idempotent(self, mock_frappe, mock_pos_order, mock_sales_invoice):
        """Test that creating invoice twice returns existing invoice"""
        from imogi_pos.api.cashier import create_invoice_from_order
        
        # Order already has invoice
        mock_pos_order.sales_invoice = "SINV-2026-00001"
        mock_frappe.get_doc.return_value = mock_pos_order
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            result = create_invoice_from_order("POS-ORD-2026-00001")
            
            assert result["success"] is True
            assert result["invoice"] == "SINV-2026-00001"
            assert "already exists" in result.get("message", "")

    def test_process_payment_no_payment_entry(self, mock_frappe, mock_sales_invoice):
        """Test that process_payment does NOT create Payment Entry"""
        from imogi_pos.api.cashier import process_payment
        
        mock_frappe.get_doc.return_value = mock_sales_invoice
        mock_frappe.get_meta.return_value.has_field.return_value = True
        
        payments = [
            {"mode_of_payment": "Cash", "amount": 150},
            {"mode_of_payment": "Card", "amount": 50}
        ]
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value={"name": "POS-OPN-2026-00001"}):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    assert result["success"] is True
                    assert result["paid_total"] == 200.0
                    
                    # Verify invoice.payments was populated (2 calls to append)
                    assert mock_sales_invoice.append.call_count == 2
                    
                    # Verify submit was called
                    mock_sales_invoice.submit.assert_called_once()
                    
                    # Verify NO Payment Entry created (only invoice operations)
                    mock_frappe.new_doc.assert_not_called()

    def test_process_payment_validates_session(self, mock_frappe, mock_sales_invoice):
        """Test that process_payment validates invoice belongs to active session"""
        from imogi_pos.api.cashier import process_payment
        
        # Invoice belongs to different session
        mock_sales_invoice.imogi_pos_session = "POS-OPN-2026-00001"
        mock_frappe.get_doc.return_value = mock_sales_invoice
        
        active_opening = {"name": "POS-OPN-2026-00002"}  # Different session
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=active_opening):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    with patch('imogi_pos.api.cashier._safe_get_dict', return_value=active_opening):
                        result = process_payment("SINV-2026-00001", payments=payments)
                        
                        assert result["success"] is False
                        assert "different session" in result["error"]

    def test_process_payment_idempotent(self, mock_frappe, mock_sales_invoice):
        """Test that processing payment on submitted invoice is idempotent"""
        from imogi_pos.api.cashier import process_payment
        
        # Invoice already submitted
        mock_sales_invoice.docstatus = 1
        mock_frappe.get_doc.return_value = mock_sales_invoice
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            result = process_payment("SINV-2026-00001", payments=payments)
            
            assert result["success"] is True
            assert "already paid" in result.get("message", "")
            # Should not call submit again
            mock_sales_invoice.submit.assert_not_called()

    def test_process_payment_underpayment(self, mock_frappe, mock_sales_invoice):
        """Test that underpayment is rejected"""
        from imogi_pos.api.cashier import process_payment
        
        mock_frappe.get_doc.return_value = mock_sales_invoice
        
        # Only pay 150 when invoice is 200
        payments = [{"mode_of_payment": "Cash", "amount": 150}]
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value={"name": "POS-OPN-2026-00001"}):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    assert result["success"] is False
                    assert "less than invoice total" in result["error"]

    def test_process_payment_change_calculation(self, mock_frappe, mock_sales_invoice):
        """Test change calculation when cash_received provided"""
        from imogi_pos.api.cashier import process_payment
        
        mock_frappe.get_doc.return_value = mock_sales_invoice
        mock_frappe.get_meta.return_value.has_field.return_value = True
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value={"name": "POS-OPN-2026-00001"}):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    result = process_payment("SINV-2026-00001", payments=payments, cash_received=500)
                    
                    assert result["success"] is True
                    assert result["cash_received"] == 500.0
                    assert result["change_amount"] == 300.0  # 500 - 200

    def test_get_pending_orders_dynamic_fields(self, mock_frappe):
        """Test that get_pending_orders only requests existing fields"""
        from imogi_pos.api.cashier import get_pending_orders
        
        # Mock field checking - waiter field does not exist
        def has_field_mock(doctype, fieldname):
            if doctype == "POS Order" and fieldname == "waiter":
                return False
            return True
        
        mock_frappe.get_all.return_value = []
        
        with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
            with patch('imogi_pos.api.cashier._has_field', side_effect=has_field_mock):
                result = get_pending_orders(waiter="John")
                
                # Should succeed even though waiter field doesn't exist
                assert result["success"] is True
                
                # Verify get_all was called
                call_args = mock_frappe.get_all.call_args
                fields = call_args[1]["fields"]
                
                # waiter should NOT be in fields list
                assert "waiter" not in fields

    def test_closing_aggregates_from_invoice_payments(self, mock_frappe, mock_pos_opening):
        """Test that closing aggregates expected totals from Sales Invoice Payment"""
        from imogi_pos.api.cashier import get_opening_summary, close_pos_opening
        
        mock_frappe.get_doc.return_value = mock_pos_opening
        
        # Mock SQL query results - payments collected during session
        mock_frappe.db.sql.return_value = [
            {"mode_of_payment": "Cash", "total": 1500.0},
            {"mode_of_payment": "Card", "total": 800.0}
        ]
        
        # Test summary
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            summary = get_opening_summary("POS-OPN-2026-00001")
            
            assert summary["success"] is True
            assert len(summary["totals_by_mode"]) == 2
            assert summary["grand_total"] == 2300.0

    def test_closing_covers_all_modes(self, mock_frappe, mock_pos_opening):
        """Test that closing reconciliation includes all modes (opening + paid + counted)"""
        from imogi_pos.api.cashier import close_pos_opening
        
        mock_frappe.get_doc.return_value = mock_pos_opening
        mock_frappe.new_doc.return_value = Mock(
            append=Mock(),
            insert=Mock(),
            submit=Mock()
        )
        
        # Mock payments collected: Cash=1500, Card=800
        mock_frappe.db.sql.return_value = [
            {"mode_of_payment": "Cash", "total": 1500.0},
            {"mode_of_payment": "Card", "total": 800.0}
        ]
        
        # User only counted Cash and Card, but forgot Mobile (which had opening balance)
        counted_balances = [
            {"mode_of_payment": "Cash", "closing_amount": 2500.0},  # 1000 opening + 1500 paid
            {"mode_of_payment": "Card", "closing_amount": 800.0},   # 0 opening + 800 paid
        ]
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            with patch('imogi_pos.api.cashier._set_if_field'):
                result = close_pos_opening("POS-OPN-2026-00001", counted_balances)
                
                assert result["success"] is True
                assert len(result["reconciliation_summary"]) == 2
                assert result["total_difference"] == 0.0  # All balanced

    def test_complete_order_workflow_handling(self, mock_frappe, mock_pos_order):
        """Test that complete_order handles workflow vs direct field set"""
        from imogi_pos.api.cashier import complete_order
        
        mock_frappe.get_doc.return_value = mock_pos_order
        mock_frappe.get_all.return_value = []  # No KOTs
        mock_frappe.db.exists.side_effect = lambda dt, name=None: {
            "POS Order": True,
            "Sales Invoice": True,
            "Restaurant Table": True,
            "Workflow": False  # No workflow configured
        }.get(dt, False)
        
        mock_invoice = Mock(docstatus=1)
        
        def get_doc_side_effect(doctype, name=None):
            if doctype == "Sales Invoice":
                return mock_invoice
            return mock_pos_order
        
        mock_frappe.get_doc.side_effect = get_doc_side_effect
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            result = complete_order("POS-ORD-2026-00001", invoice_name="SINV-2026-00001")
            
            assert result["success"] is True
            # Should have called save on order
            mock_pos_order.save.assert_called_once()

    def test_no_manual_commits(self, mock_frappe, mock_sales_invoice):
        """Test that functions don't call frappe.db.commit() manually"""
        from imogi_pos.api.cashier import process_payment
        
        mock_frappe.get_doc.return_value = mock_sales_invoice
        mock_frappe.get_meta.return_value.has_field.return_value = True
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value={"name": "POS-OPN-2026-00001"}):
            with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
                with patch('imogi_pos.api.cashier._has_field', return_value=True):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    # Should NOT call commit (rely on Frappe's request-level transaction)
                    mock_frappe.db.commit.assert_not_called()


class TestCashierPOSOpening:
    """Test POS Opening creation and management"""

    @pytest.fixture
    def mock_frappe(self):
        with patch('imogi_pos.api.cashier.frappe') as mock:
            mock.session.user = "cashier@test.com"
            mock.has_role = Mock(return_value=True)
            mock.db.get_value = Mock(return_value="Test Company")
            mock.new_doc = Mock()
            mock._ = lambda x: x
            yield mock

    def test_create_opening_checks_existing(self, mock_frappe):
        """Test that create_pos_opening prevents duplicate active openings"""
        from imogi_pos.api.cashier import create_pos_opening
        
        existing_opening = {"name": "POS-OPN-2026-00001"}
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=existing_opening):
            with patch('imogi_pos.api.cashier._safe_get_dict', return_value=existing_opening):
                opening_balances = [{"mode_of_payment": "Cash", "opening_amount": 1000}]
                
                result = create_pos_opening("Test POS Profile", opening_balances)
                
                assert result["success"] is False
                assert "already exists" in result["error"]
                assert "existing_opening" in result

    def test_create_opening_v15_no_currency(self, mock_frappe):
        """Test that opening balance details don't include currency (v15+)"""
        from imogi_pos.api.cashier import create_pos_opening
        
        opening_doc = Mock()
        opening_doc.name = "POS-OPN-2026-00001"
        opening_doc.balance_details = []
        opening_doc.append = Mock()
        opening_doc.insert = Mock()
        opening_doc.submit = Mock()
        
        mock_frappe.new_doc.return_value = opening_doc
        
        with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=None):
            opening_balances = [
                {"mode_of_payment": "Cash", "opening_amount": 1000},
                {"mode_of_payment": "Card", "opening_amount": 0}
            ]
            
            result = create_pos_opening("Test POS Profile", opening_balances)
            
            assert result["success"] is True
            
            # Verify append was called for each balance
            assert opening_doc.append.call_count == 2
            
            # Check that no 'currency' key in appended rows
            for call in opening_doc.append.call_args_list:
                row_data = call[0][1]
                assert "currency" not in row_data
                assert "mode_of_payment" in row_data
                assert "opening_amount" in row_data


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])


class TestCashierProductionReadiness:
    """Production-ready tests for critical validations"""

    @pytest.fixture
    def mock_frappe(self):
        with patch('imogi_pos.api.cashier.frappe') as mock:
            mock.session.user = "cashier@test.com"
            mock.has_role = Mock(return_value=True)
            mock.db.exists = Mock(return_value=True)
            mock.db.get_value = Mock(return_value="Test Company")
            mock.db.sql = Mock(return_value=[])
            mock.get_doc = Mock()
            mock.get_all = Mock(return_value=[])
            mock.new_doc = Mock()
            mock.get_meta = Mock()
            mock.throw = Mock(side_effect=Exception)
            mock._ = lambda x: x
            yield mock

    def test_complete_order_workflow_transitions(self, mock_frappe):
        """Test that complete_order uses get_transitions to find proper action"""
        from imogi_pos.api.cashier import complete_order
        
        order = Mock()
        order.name = "POS-ORD-2026-00001"
        order.workflow_state = "Submitted"
        order.save = Mock()
        
        mock_frappe.get_doc.return_value = order
        mock_frappe.get_all.return_value = []
        mock_frappe.db.exists.side_effect = lambda dt, filters=None: {
            ("POS Order", "POS-ORD-2026-00001"): True,
            ("Sales Invoice", "SINV-2026-00001"): True,
            ("Workflow", filters): True  # Workflow exists
        }.get((dt, filters) if filters else dt, False)
        
        mock_invoice = Mock(docstatus=1)
        
        # Mock get_transitions to return available transitions
        mock_transitions = [
            {"action": "Complete", "state": "Completed"},
            {"action": "Cancel", "state": "Cancelled"}
        ]
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            with patch('imogi_pos.api.cashier.get_transitions', return_value=mock_transitions):
                with patch('imogi_pos.api.cashier.apply_workflow') as mock_apply:
                    def get_doc_side_effect(doctype, name=None):
                        if doctype == "Sales Invoice":
                            return mock_invoice
                        return order
                    
                    mock_frappe.get_doc.side_effect = get_doc_side_effect
                    
                    result = complete_order("POS-ORD-2026-00001", invoice_name="SINV-2026-00001")
                    
                    # Should call apply_workflow with "Complete" action (not "Completed" state)
                    mock_apply.assert_called_once_with(order, "Complete")
                    assert result["success"] is True

    def test_complete_order_no_transition_fallback(self, mock_frappe):
        """Test that complete_order falls back to direct set if no transition found"""
        from imogi_pos.api.cashier import complete_order
        
        order = Mock()
        order.name = "POS-ORD-2026-00001"
        order.workflow_state = "Submitted"
        order.save = Mock()
        
        mock_frappe.get_doc.return_value = order
        mock_frappe.get_all.return_value = []
        mock_frappe.db.exists.side_effect = lambda dt, filters=None: {
            ("Workflow", filters): True
        }.get((dt, filters) if isinstance(filters, dict) else dt, True)
        
        # No transitions lead to Completed
        mock_transitions = [
            {"action": "Cancel", "state": "Cancelled"}
        ]
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            with patch('imogi_pos.api.cashier.get_transitions', return_value=mock_transitions):
                result = complete_order("POS-ORD-2026-00001")
                
                # Should have set workflow_state directly
                assert order.workflow_state == "Completed"
                assert result["success"] is True

    def test_process_payment_requires_operational_context(self, mock_frappe):
        """Test that process_payment fails without operational context"""
        from imogi_pos.api.cashier import process_payment
        
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        mock_frappe.get_doc.return_value = invoice
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        # Mock require_operational_context to raise exception
        with patch('imogi_pos.api.cashier.require_operational_context', side_effect=Exception("Context not available")):
            result = process_payment("SINV-2026-00001", payments=payments)
            
            assert result["success"] is False
            assert "Operational context" in result["error"]

    def test_process_payment_session_mismatch_blocks(self, mock_frappe):
        """Test that session mismatch in process_payment is FATAL (not warning)"""
        from imogi_pos.api.cashier import process_payment
        
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        invoice.pos_profile = "Test POS Profile"
        invoice.imogi_pos_session = "POS-OPN-2026-00001"  # Old session
        mock_frappe.get_doc.return_value = invoice
        
        active_opening = {"name": "POS-OPN-2026-00002"}  # Different session
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
            with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=active_opening):
                with patch('imogi_pos.api.cashier._safe_get_dict', return_value=active_opening):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    # Should return error (not proceed with warning)
                    assert result["success"] is False
                    assert "belongs to session" in result["error"]
                    assert "POS-OPN-2026-00001" in result["error"]
                    assert "POS-OPN-2026-00002" in result["error"]

    def test_process_payment_no_active_opening_fails(self, mock_frappe):
        """Test that process_payment fails if no active opening"""
        from imogi_pos.api.cashier import process_payment
        
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        invoice.pos_profile = "Test POS Profile"
        mock_frappe.get_doc.return_value = invoice
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
            with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=None):
                result = process_payment("SINV-2026-00001", payments=payments)
                
                assert result["success"] is False
                assert "No active POS Opening" in result["error"]

    def test_process_payment_reference_fallback(self, mock_frappe):
        """Test that reference_no falls back gracefully if field doesn't exist"""
        from imogi_pos.api.cashier import process_payment
        
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        invoice.grand_total = 200.0
        invoice.pos_profile = "Test POS Profile"
        invoice.imogi_pos_session = "POS-OPN-2026-00001"
        invoice.remarks = None
        invoice._ref_numbers = []
        invoice.payments = []
        invoice.append = Mock()
        invoice.set = Mock()
        invoice.run_method = Mock()
        invoice.save = Mock()
        invoice.submit = Mock()
        
        mock_frappe.get_doc.return_value = invoice
        
        payments = [{"mode_of_payment": "Cash", "amount": 200, "reference_no": "REF-12345"}]
        
        active_opening = {"name": "POS-OPN-2026-00001"}
        
        with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
            with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=active_opening):
                with patch('imogi_pos.api.cashier._safe_get_dict', return_value=active_opening):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    # Should succeed even if reference field doesn't work
                    assert result["success"] is True
                    
                    # Check if remarks was set with reference
                    if hasattr(invoice, 'remarks') and invoice.remarks:
                        assert "REF-12345" in invoice.remarks

    def test_close_pos_opening_requires_counted_balances(self, mock_frappe):
        """Test that close_pos_opening fails if counted_balances is empty"""
        from imogi_pos.api.cashier import close_pos_opening
        
        with pytest.raises(Exception) as exc_info:
            close_pos_opening("POS-OPN-2026-00001", counted_balances=[])
        
        # Should have thrown error about counted balances required
        assert True  # Exception was raised

    def test_close_pos_opening_comprehensive_modes(self, mock_frappe):
        """Test that closing includes all modes from opening, paid, and counted"""
        from imogi_pos.api.cashier import close_pos_opening
        
        opening = Mock()
        opening.name = "POS-OPN-2026-00001"
        opening.docstatus = 1
        opening.company = "Test Company"
        opening.pos_profile = "Test POS Profile"
        opening.period_start_date = datetime.now()
        opening.balance_details = [
            Mock(mode_of_payment="Cash", opening_amount=1000),
            Mock(mode_of_payment="Card", opening_amount=0),
            Mock(mode_of_payment="Mobile", opening_amount=500)  # Has opening but not paid
        ]
        
        closing_doc = Mock()
        closing_doc.name = "POS-CLS-2026-00001"
        closing_doc.append = Mock()
        closing_doc.insert = Mock()
        closing_doc.submit = Mock()
        
        mock_frappe.get_doc.return_value = opening
        mock_frappe.new_doc.return_value = closing_doc
        
        # Payments collected: Cash=1500, Card=800, Voucher=200 (no opening)
        mock_frappe.db.sql.return_value = [
            {"mode_of_payment": "Cash", "total": 1500.0},
            {"mode_of_payment": "Card", "total": 800.0},
            {"mode_of_payment": "Voucher", "total": 200.0}
        ]
        
        # User counted Cash, Card, Voucher (forgot Mobile)
        counted_balances = [
            {"mode_of_payment": "Cash", "closing_amount": 2500.0},
            {"mode_of_payment": "Card", "closing_amount": 800.0},
            {"mode_of_payment": "Voucher", "closing_amount": 200.0}
        ]
        
        with patch('imogi_pos.api.cashier._has_field', return_value=True):
            with patch('imogi_pos.api.cashier._set_if_field'):
                result = close_pos_opening("POS-OPN-2026-00001", counted_balances)
                
                assert result["success"] is True
                
                # Should have 4 modes: Cash, Card, Mobile, Voucher
                assert len(result["reconciliation_summary"]) == 4
                
                # Verify Mobile (with opening, no payment, no count) is included
                mobile_found = any(r["mode_of_payment"] == "Mobile" for r in result["reconciliation_summary"])
                assert mobile_found
                
                # Mobile should show: expected=500 (opening), counted=0, difference=-500
                mobile_rec = next(r for r in result["reconciliation_summary"] if r["mode_of_payment"] == "Mobile")
                assert mobile_rec["expected"] == 500.0
                assert mobile_rec["counted"] == 0.0
                assert mobile_rec["difference"] == -500.0

    def test_no_manual_commits_in_handlers(self, mock_frappe):
        """Test that request handlers don't call frappe.db.commit()"""
        from imogi_pos.api.cashier import process_payment, complete_order
        
        invoice = Mock()
        invoice.name = "SINV-2026-00001"
        invoice.docstatus = 0
        invoice.grand_total = 200.0
        invoice.pos_profile = "Test POS Profile"
        invoice.imogi_pos_session = "POS-OPN-2026-00001"
        invoice.payments = []
        invoice.append = Mock()
        invoice.set = Mock()
        invoice.run_method = Mock()
        invoice.save = Mock()
        invoice.submit = Mock()
        
        mock_frappe.get_doc.return_value = invoice
        
        payments = [{"mode_of_payment": "Cash", "amount": 200}]
        
        active_opening = {"name": "POS-OPN-2026-00001"}
        
        with patch('imogi_pos.api.cashier.require_operational_context', return_value={"pos_profile": "Test POS Profile"}):
            with patch('imogi_pos.api.cashier.resolve_active_pos_opening', return_value=active_opening):
                with patch('imogi_pos.api.cashier._safe_get_dict', return_value=active_opening):
                    result = process_payment("SINV-2026-00001", payments=payments)
                    
                    # Verify commit was NOT called
                    mock_frappe.db.commit.assert_not_called()
                    
                    # Should have succeeded
                    assert result["success"] is True


if __name__ == "__main__":
    pytest.main([__file__, "-v", "-s"])
