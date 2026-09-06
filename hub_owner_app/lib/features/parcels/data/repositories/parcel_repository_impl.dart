import 'package:dartz/dartz.dart';
import '../../../../core/errors/exceptions.dart';
import '../../../../core/errors/failures.dart';
import '../../domain/entities/hub_parcel.dart';
import '../../domain/repositories/parcel_repository.dart';
import '../datasources/parcel_remote_datasource.dart';
class HubParcelRepositoryImpl implements HubParcelRepository {
  final HubParcelRemoteDataSource remote;
  HubParcelRepositoryImpl({required this.remote});
  @override Future<Either<Failure, List<HubParcel>>> getMyParcels() async {
    try { return Right(await remote.getMyParcels()); } on ServerException catch (e) { return Left(ServerFailure(e.message)); }
  }
  @override Future<Either<Failure, HubParcel>> receiveParcel(String trackingCode) async {
    try { return Right(await remote.receiveParcel(trackingCode)); } on ServerException catch (e) { return Left(ServerFailure(e.message)); }
  }
  @override Future<Either<Failure, HubParcel>> deliverParcel({required String parcelId, required String otp}) async {
    try { return Right(await remote.deliverParcel(parcelId: parcelId, otp: otp)); } on ServerException catch (e) { return Left(ServerFailure(e.message)); }
  }
}
