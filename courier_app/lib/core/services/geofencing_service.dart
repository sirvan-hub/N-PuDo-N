import 'dart:math' as math;

class GeofencingService {
  static const double deliveryRadiusMeters = 50.0;
  static double calculateDistance({required double lat1, required double lng1, required double lat2, required double lng2}) {
    const double earthRadius = 6371000;
    final double dLat = _d2r(lat2 - lat1);
    final double dLng = _d2r(lng2 - lng1);
    final double a = math.sin(dLat/2)*math.sin(dLat/2) + math.cos(_d2r(lat1))*math.cos(_d2r(lat2))*math.sin(dLng/2)*math.sin(dLng/2);
    return earthRadius * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a));
  }
  static GeofenceStatus checkGeofence({required double userLat, required double userLng, required double hubLat, required double hubLng}) {
    final d = calculateDistance(lat1:userLat, lng1:userLng, lat2:hubLat, lng2:hubLng);
    if (d <= deliveryRadiusMeters) return GeofenceStatus.inside;
    if (d <= deliveryRadiusMeters * 2) return GeofenceStatus.nearby;
    return GeofenceStatus.far;
  }
  static double _d2r(double d) => d * math.pi / 180;
}
enum GeofenceStatus { inside, nearby, far }
