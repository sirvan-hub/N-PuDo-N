import 'dart:math' as math;
class GeofencingService {
  static const double deliveryRadiusMeters = 50.0;
  static double calculateDistance({required double lat1, required double lng1, required double lat2, required double lng2}) {
    const R = 6371000.0;
    final dLat = _r(lat2 - lat1), dLng = _r(lng2 - lng1);
    final a = math.sin(dLat/2)*math.sin(dLat/2) + math.cos(_r(lat1))*math.cos(_r(lat2))*math.sin(dLng/2)*math.sin(dLng/2);
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a));
  }
  static GeofenceStatus checkGeofence({required double userLat, required double userLng, required double hubLat, required double hubLng}) {
    final d = calculateDistance(lat1: userLat, lng1: userLng, lat2: hubLat, lng2: hubLng);
    if (d <= deliveryRadiusMeters) return GeofenceStatus.inside;
    if (d <= deliveryRadiusMeters * 2) return GeofenceStatus.nearby;
    return GeofenceStatus.far;
  }
  static double _r(double d) => d * math.pi / 180;
}
enum GeofenceStatus { inside, nearby, far }
