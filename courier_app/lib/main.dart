import 'package:flutter/material.dart';
import 'app/app.dart';
import 'app/di/injection.dart' as di;

void main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await di.init();
  runApp(const CourierApp());
}
