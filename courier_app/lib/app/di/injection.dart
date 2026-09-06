import 'package:get_it/get_it.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/utils/storage_util.dart';
import '../../core/services/location_service.dart';
import '../../features/auth/data/datasources/auth_remote_datasource.dart';
import '../../features/auth/data/repositories/auth_repository_impl.dart';
import '../../features/auth/domain/repositories/auth_repository.dart';
import '../../features/auth/domain/usecases/login.dart';
import '../../features/auth/domain/usecases/verify_otp.dart';
import '../../features/auth/presentation/bloc/auth_bloc.dart';
import '../../features/parcels/data/datasources/parcel_remote_datasource.dart';
import '../../features/parcels/data/repositories/parcel_repository_impl.dart';
import '../../features/parcels/domain/repositories/parcel_repository.dart';
import '../../features/parcels/domain/usecases/get_my_parcels.dart';
import '../../features/parcels/domain/usecases/scan_parcel.dart';
import '../../features/parcels/domain/usecases/request_hub_delivery.dart';
import '../../features/parcels/domain/usecases/deliver_to_hub.dart';
import '../../features/parcels/presentation/bloc/parcels_bloc.dart';
import '../../features/hubs/data/datasources/hub_remote_datasource.dart';
import '../../features/hubs/data/repositories/hub_repository_impl.dart';
import '../../features/hubs/domain/repositories/hub_repository.dart';
import '../../features/hubs/domain/usecases/get_nearby_hubs.dart';
import '../../features/hubs/presentation/bloc/hubs_bloc.dart';

final sl = GetIt.instance;

Future<void> init() async {
  sl.registerLazySingleton(() => const FlutterSecureStorage());
  sl.registerLazySingleton(() => DioClient());
  sl.registerLazySingleton(() => StorageUtil(sl()));
  sl.registerLazySingleton(() => LocationService());
  sl.registerLazySingleton<CourierAuthRemoteDataSource>(() => CourierAuthRemoteDataSourceImpl(sl()));
  sl.registerLazySingleton<CourierAuthRepository>(() => CourierAuthRepositoryImpl(remoteDataSource: sl(), storageUtil: sl()));
  sl.registerLazySingleton(() => CourierLogin(sl()));
  sl.registerLazySingleton(() => CourierVerifyOtp(sl()));
  sl.registerFactory(() => CourierAuthBloc(login: sl(), verifyOtp: sl()));
  sl.registerLazySingleton<CourierParcelRemoteDataSource>(() => CourierParcelRemoteDataSourceImpl(sl()));
  sl.registerLazySingleton<CourierParcelRepository>(() => CourierParcelRepositoryImpl(remoteDataSource: sl()));
  sl.registerLazySingleton(() => GetMyParcels(sl()));
  sl.registerLazySingleton(() => ScanParcel(sl()));
  sl.registerLazySingleton(() => RequestHubDelivery(sl()));
  sl.registerLazySingleton(() => DeliverToHubUseCase(sl()));
  sl.registerFactory(() => CourierParcelsBloc(getMyParcels: sl(), scanParcel: sl(), requestHubDelivery: sl(), deliverToHub: sl()));
  sl.registerLazySingleton<HubRemoteDataSource>(() => HubRemoteDataSourceImpl(sl()));
  sl.registerLazySingleton<HubRepository>(() => HubRepositoryImpl(remoteDataSource: sl()));
  sl.registerLazySingleton(() => GetNearbyHubs(sl()));
  sl.registerFactory(() => HubsBloc(getNearbyHubs: sl()));
}
