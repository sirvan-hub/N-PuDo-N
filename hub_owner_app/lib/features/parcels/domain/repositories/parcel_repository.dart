import 'package:dartz/dartz.dart';
import '../../../../core/errors/failures.dart';
import '../entities/hub_parcel.dart';
abstract class HubParcelRepository {
  Future<Either<Failure, List<HubParcel>>> getMyParcels();
  Future<Either<Failure, HubParcel>> receiveParcel(String trackingCode);
  Future<Either<Failure, HubParcel>> deliverParcel({required String parcelId, required String otp});
}
