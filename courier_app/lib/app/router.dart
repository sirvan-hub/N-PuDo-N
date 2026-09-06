import 'package:flutter/material.dart';
import '../features/auth/presentation/pages/login_page.dart';
import '../features/auth/presentation/pages/otp_page.dart';
import '../features/dashboard/presentation/pages/dashboard_page.dart';
import '../features/parcels/presentation/pages/my_parcels_page.dart';
import '../features/parcels/presentation/pages/scan_parcel_page.dart';

class CourierRouter {
  static const loginRoute = '/login';
  static const otpRoute = '/otp';
  static const dashboardRoute = '/dashboard';
  static const parcelsRoute = '/parcels';
  static const scanRoute = '/scan';

  static Route<dynamic> generateRoute(RouteSettings settings) {
    switch (settings.name) {
      case loginRoute: return MaterialPageRoute(builder: (_) => const CourierLoginPage());
      case otpRoute: return MaterialPageRoute(builder: (_) => CourierOtpPage(phone: settings.arguments as String));
      case dashboardRoute: return MaterialPageRoute(builder: (_) => const DashboardPage());
      case parcelsRoute: return MaterialPageRoute(builder: (_) => const MyParcelsPage());
      case scanRoute: return MaterialPageRoute(builder: (_) => const ScanParcelPage());
      default: return MaterialPageRoute(builder: (_) => const Scaffold(body: Center(child: Text('Not Found'))));
    }
  }
}
