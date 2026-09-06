import 'package:get_it/get_it.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../../core/network/dio_client.dart';
import '../../core/utils/storage_util.dart';
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
import '../../features/parcels/domain/usecases/receive_parcel.dart';
import '../../features/parcels/domain/usecases/deliver_parcel.dart';
import '../../features/parcels/presentation/bloc/parcels_bloc.dart';

final sl = GetIt.instance;

Future<void> init() async {
  sl.registerLazySingleton(() => const FlutterSecureStorage());
  sl.registerLazySingleton(() => DioClient());
  sl.registerLazySingleton(() => StorageUtil(sl()));
  
  // Auth
  sl.registerLazySingleton<HubAuthRemoteDataSource>(() => HubAuthRemoteDataSourceImpl(sl()));
  sl.registerLazySingleton<HubAuthRepository>(() => HubAuthRepositoryImpl(remoteDataSource: sl(), storageUtil: sl()));
  sl.registerLazySingleton(() => HubLogin(sl()));
  sl.registerLazySingleton(() => HubVerifyOtp(sl()));
  sl.registerFactory(() => HubAuthBloc(login: sl(), verifyOtp: sl()));
  
  // Parcels
  sl.registerLazySingleton<HubParcelRemoteDataSource>(() => HubParcelRemoteDataSourceImpl(sl()));
  sl.registerLazySingleton<HubParcelRepository>(() => HubParcelRepositoryImpl(remote: sl()));
  sl.registerLazySingleton(() => GetMyParcels(sl()));
  sl.registerLazySingleton(() => ReceiveParcel(sl()));
  sl.registerLazySingleton(() => DeliverParcel(sl()));
  sl.registerFactory(() => HubParcelsBloc(getMyParcels: sl(), receiveParcel: sl(), deliverParcel: sl()));
}
