class ApiConstants {
  static const String baseUrl = 'http://10.0.2.2:3000/v1';
  static const String login = '/auth/login';
  static const String verifyOtp = '/auth/verify-otp';
  static const String myParcels = '/courier/parcels';
  static const String scanParcel = '/courier/parcels/scan';
  static const String requestHubDelivery = '/courier/parcels/request-hub';
  static const String deliverToHub = '/courier/parcels/deliver-to-hub';
  static const String nearbyHubs = '/hubs/nearby';
}
