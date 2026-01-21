# Service Domain - Future Implementation

This directory contains placeholder structure for the **Service** business domain.

## Planned Features

### `/service/booking/`
- Appointment scheduling interface
- Service provider calendar
- Resource allocation (rooms, equipment)
- Customer booking portal
- Waitlist management

### `/service/queue/`
- Queue number display
- Real-time queue status
- SMS/notification integration
- Multi-counter queue routing
- Average wait time calculation

### `/service/billing/`
- Time-based billing
- Service package selection
- Membership/subscription handling
- Technician commission tracking
- Service completion workflow

## Configuration

Service domain will be activated via POS Profile setting:
```
imogi_pos_domain = "Service"
```

## Implementation Status

⏳ **Planned for Q3 2026**

Current implementation focuses on Restaurant domain. This structure is prepared for future scalability.

## Use Cases

- **Salons & Spas**: Booking, service tracking, product sales
- **Clinics**: Appointment scheduling, consultation fees
- **Repair Services**: Job tracking, parts + labor billing
- **Car Wash**: Package selection, queue management
- **Fitness Centers**: Membership, class booking, trainer sessions

## Related Components

- **DocTypes**: To be created in `imogi_pos/imogi_pos/doctype/`
- **API Endpoints**: To be added in `imogi_pos/api/service.py`
- **Fixtures**: Service type templates in `imogi_pos/fixtures/`

## Notes for Future Developers

- Follow authentication patterns established in Restaurant domain
- Reuse queue system from restaurant (already implemented)
- Consider service-specific DocTypes: Service Item, Service Provider, Appointment, Service Package
- Integration with calendar/scheduling libraries
