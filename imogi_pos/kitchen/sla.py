import frappe
from frappe import _
from frappe.utils import now_datetime, time_diff_in_seconds, get_datetime, add_to_date
from typing import Dict, List, Optional, Union, Any, Tuple
import json
from datetime import datetime, timedelta


class KitchenSLA:
    """
    Service Level Agreement tracker for kitchen operations
    
    Calculates:
    - Queue time (time from order to start of preparation)
    - Preparation time (time from start to ready)
    - Total service time (time from order to ready)
    - SLA compliance (whether times are within targets)
    """
    
    # SLA levels for visual indicators
    SLA_LEVELS = {
        "NORMAL": "normal",  # Within target
        "WARNING": "warning", # Approaching target
        "CRITICAL": "critical", # Exceeded target
        "EXPIRED": "expired"  # Severely exceeded target
    }
    
    def __init__(self, kitchen_station: Optional[str] = None):
        """
        Initialize the SLA calculator
        
        Args:
            kitchen_station: Optional kitchen station to use for target times
        """
        self.kitchen_station = kitchen_station
        self.station_settings = None
        self.kitchen_settings = None
        
        # Load station settings if provided
        if kitchen_station:
            self.load_station_settings(kitchen_station)
    
    def load_station_settings(self, station_name: str) -> Dict:
        """
        Load SLA settings for a specific kitchen station
        
        Args:
            station_name: Kitchen Station name
            
        Returns:
            Dictionary with station settings
        """
        self.station_settings = frappe.db.get_value(
            "Kitchen Station", 
            station_name, 
            [
                "target_queue_time", 
                "target_prep_time", 
                "warning_threshold",
                "critical_threshold",
                "kitchen"
            ], 
            as_dict=1
        )
        
        # If there's a kitchen, also load its settings
        if self.station_settings and self.station_settings.kitchen:
            self.kitchen_settings = frappe.db.get_value(
                "Kitchen", 
                self.station_settings.kitchen, 
                ["default_target_queue_time", "default_target_prep_time"], 
                as_dict=1
            )
        
        return self.station_settings
    
    def get_sla_status(
        self, 
        kot_ticket: Optional[str] = None, 
        kot_item: Optional[str] = None,
        timestamps: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Calculate SLA status for a KOT Ticket or Item
        
        Args:
            kot_ticket: KOT Ticket name (optional)
            kot_item: KOT Item name (optional)
            timestamps: Dictionary with timestamps (optional, for manual calculation)
                Expected keys: queued, preparing, ready
                
        Returns:
            Dictionary with SLA status information
        """
        # If no timestamps provided, fetch from documents
        if not timestamps:
            timestamps = self._get_timestamps(kot_ticket, kot_item)
            
        # If no timestamps available, return default status
        if not timestamps or not timestamps.get("queued"):
            return {
                "status": "unknown",
                "queue_time": 0,
                "prep_time": 0,
                "total_time": 0,
                "queue_sla": self.SLA_LEVELS["NORMAL"],
                "prep_sla": self.SLA_LEVELS["NORMAL"],
                "total_sla": self.SLA_LEVELS["NORMAL"],
                "message": _("Not enough data for SLA calculation")
            }
            
        # Get current time for ongoing calculations
        now = now_datetime()
        
        # Calculate times in seconds
        queue_time = self._calculate_time_diff(
            timestamps.get("queued"), 
            timestamps.get("preparing") or now
        )
        
        prep_time = 0
        if timestamps.get("preparing"):
            prep_time = self._calculate_time_diff(
                timestamps.get("preparing"),
                timestamps.get("ready") or now
            )
            
        total_time = queue_time + prep_time
        
        # Get target times
        target_queue_time, target_prep_time = self._get_target_times()
        target_total_time = target_queue_time + target_prep_time
        
        # Calculate SLA compliance
        queue_sla = self._calculate_sla_level(queue_time, target_queue_time)
        prep_sla = self._calculate_sla_level(prep_time, target_prep_time)
        total_sla = self._calculate_sla_level(total_time, target_total_time)
        
        # Determine overall status
        status = "on_time"
        if total_sla == self.SLA_LEVELS["WARNING"]:
            status = "at_risk"
        elif total_sla in [self.SLA_LEVELS["CRITICAL"], self.SLA_LEVELS["EXPIRED"]]:
            status = "delayed"
            
        # Generate human-readable message
        message = self._generate_sla_message(
            queue_time, prep_time, total_time,
            target_queue_time, target_prep_time, target_total_time,
            queue_sla, prep_sla, total_sla
        )
        
        return {
            "status": status,
            "queue_time": queue_time,
            "prep_time": prep_time,
            "total_time": total_time,
            "target_queue_time": target_queue_time,
            "target_prep_time": target_prep_time,
            "target_total_time": target_total_time,
            "queue_sla": queue_sla,
            "prep_sla": prep_sla,
            "total_sla": total_sla,
            "queue_time_formatted": self._format_time(queue_time),
            "prep_time_formatted": self._format_time(prep_time),
            "total_time_formatted": self._format_time(total_time),
            "message": message
        }
    
    def get_station_summary(self, station_name: str) -> Dict[str, Any]:
        """
        Calculate SLA summary for a kitchen station
        
        Args:
            station_name: Kitchen Station name
            
        Returns:
            Dictionary with SLA summary information
        """
        # Load station settings if not already loaded
        if not self.station_settings or self.kitchen_station != station_name:
            self.load_station_settings(station_name)
            
        # Get active KOT tickets for this station
        active_tickets = frappe.get_all(
            "KOT Ticket",
            filters={
                "kitchen_station": station_name,
                "workflow_state": ["in", ["Queued", "Preparing"]]
            },
            fields=["name", "workflow_state", "creation_time"]
        )
        
        # Initialize counters
        summary = {
            "total_active": len(active_tickets),
            "queued": 0,
            "preparing": 0,
            "delayed": 0,
            "at_risk": 0,
            "on_time": 0,
            "avg_queue_time": 0,
            "avg_prep_time": 0,
            "avg_total_time": 0,
            "oldest_ticket_time": None,
            "oldest_ticket_sla": self.SLA_LEVELS["NORMAL"],
        }
        
        if not active_tickets:
            return summary
            
        # Calculate SLA for each ticket
        total_queue_time = 0
        total_prep_time = 0
        oldest_time = None
        
        for ticket in active_tickets:
            # Count by state
            if ticket.workflow_state == "Queued":
                summary["queued"] += 1
            elif ticket.workflow_state == "Preparing":
                summary["preparing"] += 1
                
            # Calculate SLA
            sla_status = self.get_sla_status(kot_ticket=ticket.name)
            
            # Count by SLA status
            if sla_status["status"] == "delayed":
                summary["delayed"] += 1
            elif sla_status["status"] == "at_risk":
                summary["at_risk"] += 1
            elif sla_status["status"] == "on_time":
                summary["on_time"] += 1
                
            # Accumulate times for averaging
            total_queue_time += sla_status["queue_time"]
            total_prep_time += sla_status["prep_time"]
            
            # Track oldest ticket
            ticket_time = get_datetime(ticket.creation_time)
            if not oldest_time or ticket_time < oldest_time:
                oldest_time = ticket_time
                summary["oldest_ticket_time"] = ticket_time
                summary["oldest_ticket_sla"] = sla_status["total_sla"]
        
        # Calculate averages
        if summary["total_active"] > 0:
            summary["avg_queue_time"] = total_queue_time / summary["total_active"]
            summary["avg_prep_time"] = total_prep_time / summary["total_active"]
            summary["avg_total_time"] = summary["avg_queue_time"] + summary["avg_prep_time"]
            
        return summary
    
    def calculate_daily_performance(
        self, 
        station_name: str, 
        date: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Calculate daily SLA performance metrics for a kitchen station
        
        Args:
            station_name: Kitchen Station name
            date: Optional date string (YYYY-MM-DD), defaults to today
            
        Returns:
            Dictionary with performance metrics
        """
        # This is a stub implementation - in a full version this would:
        # 1. Query completed KOT tickets for the specified day
        # 2. Calculate average queue, prep, and total times
        # 3. Calculate SLA compliance percentages
        # 4. Calculate peak times and load distribution
        # 5. Identify problematic menu items
        
        if not date:
            date = frappe.utils.today()
            
        # Load station settings if not already loaded
        if not self.station_settings or self.kitchen_station != station_name:
            self.load_station_settings(station_name)
            
        # Stub return with sample data
        return {
            "date": date,
            "station": station_name,
            "total_tickets": 0,
            "completed_tickets": 0,
            "cancelled_tickets": 0,
            "avg_queue_time": 0,
            "avg_prep_time": 0,
            "avg_total_time": 0,
            "sla_compliance": {
                "on_time_percent": 0,
                "at_risk_percent": 0,
                "delayed_percent": 0
            },
            "peak_hours": [],
            "problem_items": []
        }
        
    def _get_timestamps(
        self, 
        kot_ticket: Optional[str] = None, 
        kot_item: Optional[str] = None
    ) -> Dict[str, datetime]:
        """
        Get timestamps from KOT Ticket or Item
        
        Args:
            kot_ticket: KOT Ticket name
            kot_item: KOT Item name
            
        Returns:
            Dictionary with timestamp information
        """
        timestamps = {}
        
        if kot_item:
            # For a KOT Item, we can get workflow transitions
            item_doc = frappe.get_doc("KOT Item", kot_item)
            
            # Get KOT Ticket if not provided
            if not kot_ticket:
                kot_ticket = item_doc.parent
                
            # Get creation time from parent ticket
            ticket_doc = frappe.get_doc("KOT Ticket", kot_ticket)
            timestamps["queued"] = get_datetime(ticket_doc.creation_time)
            
            # Get state transitions from modified timestamps or version timeline
            # This is a simplified approach - in a full implementation, you would
            # track exact state transition times in a separate log or use the
            # Version timeline to get precise timestamps
            if item_doc.workflow_state in ["Preparing", "Ready", "Served"]:
                # In a real implementation, get actual transition timestamp
                # For now, use modified as an approximation
                timestamps["preparing"] = get_datetime(item_doc.modified)
                
            if item_doc.workflow_state in ["Ready", "Served"]:
                # Again, this is an approximation
                timestamps["ready"] = get_datetime(item_doc.modified)
                
        elif kot_ticket:
            # For a KOT Ticket, get creation time and modified time
            ticket_doc = frappe.get_doc("KOT Ticket", kot_ticket)
            timestamps["queued"] = get_datetime(ticket_doc.creation_time)
            
            # Simplified approach for transitions
            if ticket_doc.workflow_state in ["Preparing", "Ready", "Served"]:
                timestamps["preparing"] = get_datetime(ticket_doc.modified)
                
            if ticket_doc.workflow_state in ["Ready", "Served"]:
                timestamps["ready"] = get_datetime(ticket_doc.modified)
        
        return timestamps
    
    def _calculate_time_diff(
        self, 
        start_time: datetime, 
        end_time: datetime
    ) -> int:
        """
        Calculate time difference in seconds
        
        Args:
            start_time: Start datetime
            end_time: End datetime
            
        Returns:
            Time difference in seconds
        """
        return time_diff_in_seconds(end_time, start_time)
    
    def _get_target_times(self) -> Tuple[int, int]:
        """
        Get target times for queue and preparation
        
        Returns:
            Tuple of (target_queue_time, target_prep_time) in seconds
        """
        # Default values
        target_queue_time = 300  # 5 minutes
        target_prep_time = 600   # 10 minutes
        
        # If station settings are loaded, use those
        if self.station_settings:
            if self.station_settings.get("target_queue_time"):
                target_queue_time = self.station_settings.get("target_queue_time") * 60
                
            if self.station_settings.get("target_prep_time"):
                target_prep_time = self.station_settings.get("target_prep_time") * 60
                
        # Fall back to kitchen settings if available
        elif self.kitchen_settings:
            if self.kitchen_settings.get("default_target_queue_time"):
                target_queue_time = self.kitchen_settings.get("default_target_queue_time") * 60
                
            if self.kitchen_settings.get("default_target_prep_time"):
                target_prep_time = self.kitchen_settings.get("default_target_prep_time") * 60
                
        return (target_queue_time, target_prep_time)
    
    def _calculate_sla_level(self, actual_time: int, target_time: int) -> str:
        """
        Calculate SLA level based on actual vs target time
        
        Args:
            actual_time: Actual time in seconds
            target_time: Target time in seconds
            
        Returns:
            SLA level string
        """
        # Get thresholds from settings
        warning_threshold = 0.8  # 80% of target time
        critical_threshold = 1.0  # 100% of target time
        expired_threshold = 1.5   # 150% of target time
        
        if self.station_settings:
            if self.station_settings.get("warning_threshold"):
                warning_threshold = self.station_settings.get("warning_threshold") / 100
                
            if self.station_settings.get("critical_threshold"):
                critical_threshold = self.station_settings.get("critical_threshold") / 100
                
        # Calculate level
        if actual_time < target_time * warning_threshold:
            return self.SLA_LEVELS["NORMAL"]
        elif actual_time < target_time * critical_threshold:
            return self.SLA_LEVELS["WARNING"]
        elif actual_time < target_time * expired_threshold:
            return self.SLA_LEVELS["CRITICAL"]
        else:
            return self.SLA_LEVELS["EXPIRED"]
    
    def _format_time(self, seconds: int) -> str:
        """
        Format time in seconds to a human-readable string
        
        Args:
            seconds: Time in seconds
            
        Returns:
            Formatted time string (e.g. "5m 30s")
        """
        minutes, seconds = divmod(int(seconds), 60)
        hours, minutes = divmod(minutes, 60)
        
        if hours > 0:
            return f"{hours}h {minutes}m"
        elif minutes > 0:
            return f"{minutes}m {seconds}s"
        else:
            return f"{seconds}s"
    
    def _generate_sla_message(
        self,
        queue_time: int,
        prep_time: int,
        total_time: int,
        target_queue_time: int,
        target_prep_time: int,
        target_total_time: int,
        queue_sla: str,
        prep_sla: str,
        total_sla: str
    ) -> str:
        """
        Generate a human-readable SLA message
        
        Args:
            Various time and SLA metrics
            
        Returns:
            Formatted message string
        """
        if total_sla == self.SLA_LEVELS["NORMAL"]:
            return _("On track: {0} of {1} target time used").format(
                self._format_time(total_time),
                self._format_time(target_total_time)
            )
        elif total_sla == self.SLA_LEVELS["WARNING"]:
            return _("Approaching target: {0} of {1} target time used").format(
                self._format_time(total_time),
                self._format_time(target_total_time)
            )
        elif total_sla == self.SLA_LEVELS["CRITICAL"]:
            return _("Exceeding target: {0} over {1} target time").format(
                self._format_time(total_time - target_total_time),
                self._format_time(target_total_time)
            )
        else:  # EXPIRED
            return _("Severely delayed: {0} over {1} target time").format(
                self._format_time(total_time - target_total_time),
                self._format_time(target_total_time)
            )


# Module-level functions as convenience wrappers around the service class

def get_kot_sla_status(kot_ticket=None, kot_item=None, kitchen_station=None):
    """Module-level wrapper to get SLA status for a KOT Ticket or Item"""
    sla = KitchenSLA(kitchen_station)
    return sla.get_sla_status(kot_ticket, kot_item)

def get_station_sla_summary(station_name):
    """Module-level wrapper to get SLA summary for a kitchen station"""
    sla = KitchenSLA(station_name)
    return sla.get_station_summary(station_name)

def get_station_daily_performance(station_name, date=None):
    """Module-level wrapper to get daily performance metrics for a kitchen station"""
    sla = KitchenSLA(station_name)
    return sla.calculate_daily_performance(station_name, date)

def process_hourly_metrics():
    # TODO: implement real job
    pass

def generate_daily_report():
    # TODO: implement real job
    pass
