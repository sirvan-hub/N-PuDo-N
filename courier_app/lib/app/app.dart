import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'di/injection.dart' as di;
import 'router.dart';
import '../features/auth/presentation/bloc/auth_bloc.dart';
import '../features/parcels/presentation/bloc/parcels_bloc.dart';
import '../features/hubs/presentation/bloc/hubs_bloc.dart';

class CourierApp extends StatelessWidget {
  const CourierApp({super.key});
  @override
  Widget build(BuildContext context) {
    return MultiBlocProvider(
      providers: [
        BlocProvider(create: (_) => di.sl<CourierAuthBloc>()),
        BlocProvider(create: (_) => di.sl<CourierParcelsBloc>()),
        BlocProvider(create: (_) => di.sl<HubsBloc>()),
      ],
      child: MaterialApp(
        title: 'Courier App',
        debugShowCheckedModeBanner: false,
        theme: ThemeData(primarySwatch: Colors.blue, useMaterial3: true),
        onGenerateRoute: CourierRouter.generateRoute,
        initialRoute: CourierRouter.loginRoute,
      ),
    );
  }
}
